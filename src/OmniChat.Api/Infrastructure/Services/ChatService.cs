using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Streams chat completions from either the Hermes agent gateway (Agent Mode) or a direct
/// OpenAI-compatible provider (Direct Mode), normalising both to a plain token stream.
/// </summary>
public sealed class ChatService : IChatService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly HermesOptions _hermes;
    private readonly LlmOptions _llm;
    private readonly StreamingOptions _streaming;
    private readonly ILogger<ChatService> _logger;

    public ChatService(
        IHttpClientFactory httpClientFactory,
        IOptions<HermesOptions> hermes,
        IOptions<LlmOptions> llm,
        IOptions<StreamingOptions> streaming,
        ILogger<ChatService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _hermes = hermes.Value;
        _llm = llm.Value;
        _streaming = streaming.Value;
        _logger = logger;
    }

    // `yield return` is not allowed inside a try/catch (CS1626/CS1631), so the producer runs
    // on its own task and pushes into an unbounded channel. The iterator only ever reads from
    // the channel, which lets the producer absorb upstream failures without aborting the
    // enumeration mid-stream.
    public async IAsyncEnumerable<string> StreamChatResponseAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var channel = Channel.CreateUnbounded<string>();
        var producer = Task.Run(
            () => ProduceTokensAsync(channel.Writer, request, cancellationToken),
            cancellationToken);

        try
        {
            await foreach (var token in channel.Reader.ReadAllAsync(cancellationToken))
            {
                yield return token;
            }
        }
        finally
        {
            // Observe the producer so an exception it raised is not swallowed as an
            // unobserved task exception, and so the channel is always completed.
            await producer;
        }
    }

    private async Task ProduceTokensAsync(ChannelWriter<string> writer, ChatRequest request, CancellationToken ct)
    {
        var endpoint = request.UseHermesBridge ? _hermes.Endpoint : _llm.Endpoint;
        var mode = request.UseHermesBridge ? "Hermes" : "LLM";

        try
        {
            var apiKey = request.UseHermesBridge ? _hermes.ApiKey : _llm.ApiKey;
            var client = _httpClientFactory.CreateClient("LLMClient");

            var payload = new Dictionary<string, object?>
            {
                ["model"] = request.Model,
                ["messages"] = request.Messages.Select(m => new { role = m.Role, content = m.Content }),
                ["stream"] = true
            };

            if (request.Temperature.HasValue)
            {
                payload["temperature"] = request.Temperature.Value;
            }

            if (request.MaxTokens.HasValue)
            {
                payload["max_tokens"] = request.MaxTokens.Value;
            }

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(apiKey))
            {
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            }

            using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);

            // The connection is live but no content has been produced yet: this is the
            // window where Agent mode spends most of its wall-clock time. Announce it so
            // the client can show progress instead of a frozen placeholder.
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("LLM API error: {StatusCode} - {Content}", response.StatusCode, errorContent);
                // Sanitize: don't reveal the upstream provider's HTTP status to the client.
                await writer.WriteAsync("[Error: The AI provider returned an error. Please try again.]", ct);
                return;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            // The pre-token window is announced as thinking: until the first final-content
            // delta arrives we cannot claim the answer is being composed, only that the
            // model is still working. Agent loop steps and model reasoning are this window.
            var phase = ProgressMessages.Thinking;
            await WriteProgressAsync(writer, phase, ct);

                        var idleTimeout = _streaming.IdleTimeout;
            var progressInterval = _streaming.ProgressInterval;

            // Two independent liveness timers govern the read, because a single token that
            // serves both would let one mask the other:
            //   - heartbeat: writes a progress frame every ProgressInterval of *silence* to
            //     reassure a client whose request is still alive. It never touches the idle
            //     deadline, so a quiet upstream cannot postpone its own abort.
            //   - idle deadline: aborts the read after IdleTimeout with no bytes at all. It
            //     is reset on every real byte, so a stream that keeps producing is never cut
            //     short.
            using var idleCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(ct, idleCts.Token);

            // Arm the idle deadline up front: a silent upstream must abort even if it never
            // sends the first byte. It is re-armed below on every byte read.
            if (idleTimeout is { } initialIdle)
            {
                idleCts.CancelAfter(initialIdle);
            }

            long lastDataTicks = Environment.TickCount64;
            Task? heartbeatTask = null;
            if (progressInterval is { } pi)
            {
                heartbeatTask = Task.Run(async () =>
                {
                    try
                    {
                        while (!heartbeatCts.IsCancellationRequested)
                        {
                            await Task.Delay(pi, heartbeatCts.Token);
                            // Reassure only if nothing arrived since the previous beat.
                            if (Environment.TickCount64 - lastDataTicks >= pi.TotalMilliseconds)
                            {
                                await WriteProgressAsync(writer, phase, CancellationToken.None);
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Shutdown or client gone — expected.
                    }
                }, heartbeatCts.Token);
            }

            try
            {
                string? line;
                while (true)
                {
                    try
                    {
                        line = await reader.ReadLineAsync(idleCts.Token);
                    }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                    {
                        // Only the idle deadline fired — the caller is still connected. The
                        // upstream accepted the request and then went quiet, so report it
                        // rather than hang. A client-disconnect cancellation falls through to
                        // the outer handler below and is simply rethrown.
                        _logger.LogWarning(
                            "Upstream {Mode} endpoint at {Endpoint} sent no data for {TimeoutSeconds}s; aborting the stream.",
                            mode, endpoint, _streaming.IdleTimeoutSeconds);
                        // Stop the heartbeat before reporting the terminal error, so the
                        // error frame is the last thing the client sees — otherwise a beat
                        // landing right after the idle deadline appends a stray progress
                        // frame after it (regression caught by
                        // StreamChatResponseAsync_SilentUpstreamWithHeartbeat_StillAbortsAfterIdle).
                        heartbeatCts.Cancel();
                        if (heartbeatTask is not null)
                        {
                            try { await heartbeatTask; } catch (OperationCanceledException) { }
                        }
                        await writer.WriteAsync(
                            "[Error: The AI provider stopped responding. Please try again.]",
                            CancellationToken.None);
                        return;
                    }

                    if (line == null) break;

                    ct.ThrowIfCancellationRequested();

                    // Any byte — including a keep-alive or a role-only delta — proves liveness.
                    lastDataTicks = Environment.TickCount64;
                    if (idleTimeout is { } idle)
                    {
                        idleCts.CancelAfter(idle);
                    }

                    if (string.IsNullOrWhiteSpace(line)) continue;
                    if (!line.StartsWith("data: ")) continue;

                    var data = line["data: ".Length..].Trim();
                    if (data == "[DONE]") break;

                    var usage = TryExtractUsage(data);
                    if (usage is { } u)
                    {
                        if (u.Prompt > 0 || u.Completion > 0)
                        {
                            await writer.WriteAsync(UsageFrame.Encode(u.Prompt, u.Completion), ct);
                        }
                        continue;
                    }

                    var (deltaText, isReasoning) = TryExtractDeltaContent(data);
                    if (!string.IsNullOrEmpty(deltaText))
                    {
                        if (isReasoning)
                        {
                            // The model is still reasoning. The phase already starts as
                            // thinking, so this only re-asserts it when content had begun and
                            // reasoning resumed afterwards.
                            if (phase != ProgressMessages.Thinking)
                            {
                                phase = ProgressMessages.Thinking;
                                await writer.WriteAsync(ProgressPhase.Encode(phase), ct);
                            }
                        }
                        else
                        {
                            // Final content composes the answer; any later silence reports
                            // "Menyusun jawaban" rather than a pre-token thinking state.
                            phase = ProgressMessages.Working;
                        }
                        await writer.WriteAsync(deltaText, ct);
                    }
                }
            }
            finally
            {
                heartbeatCts.Cancel();
                if (heartbeatTask is not null)
                {
                    try { await heartbeatTask; } catch (OperationCanceledException) { }
                }
                idleCts.Cancel();
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // Only the idle deadline fired — the caller is still connected. The upstream
            // accepted the request and then went quiet, so report that rather than hang.
            _logger.LogWarning(
                "Upstream {Mode} endpoint at {Endpoint} sent no data for {TimeoutSeconds}s; aborting the stream.",
                mode, endpoint, _streaming.IdleTimeoutSeconds);

            await writer.WriteAsync(
                "[Error: The AI provider stopped responding. Please try again.]",
                CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected or the host is shutting down — nothing to report.
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reach the configured {Mode} endpoint at {Endpoint}.", mode, endpoint);

            // Surface a sanitized, actionable message. The previous implementation streamed a
            // hard-coded "Fallback Mode" demo paragraph, which masked outages as success.
            await writer.WriteAsync(
                "[Error: The AI provider is unreachable. Check the backend's provider configuration.]",
                CancellationToken.None);
        }
        finally
        {
            writer.TryComplete();
        }
    }

    /// <summary>
    /// Writes one <c>{"status":"…"}</c> progress frame, unless the heartbeat is disabled.
    /// </summary>
    /// <remarks>
    /// The frame is a plain JSON object with a single <c>status</c> key, mirroring how the
    /// error channel writes <c>{"error":"…"}</c> — the client distinguishes the two by key,
    /// so a status frame can never be mistaken for assistant text.
    /// <para>
    /// Written with <see cref="CancellationToken.None"/> on purpose: this frame exists to
    /// reassure a client whose request is still alive, so it must not be dropped just
    /// because the read-side token happens to be cancelled at this instant.
    /// </para>
    /// </remarks>
    private async Task WriteProgressAsync(ChannelWriter<string> writer, string phase, CancellationToken ct)
    {
        if (_streaming.ProgressInterval is null) return;

        await writer.WriteAsync(ProgressPhase.Encode(phase), ct);
    }

    /// <summary>
    /// Extracts <c>choices[0].delta</c> text from one SSE payload, reporting whether it was
    /// reasoning (<c>reasoning_content</c> / <c>reasoning</c>) or final <c>content</c>.
    /// </summary>
    /// <returns>An empty tuple for keep-alives, role-only deltas and malformed JSON.</returns>
    private static (string? Text, bool IsReasoning) TryExtractDeltaContent(string data)
    {
        try
        {
            using var doc = JsonDocument.Parse(data);
            if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                choices.ValueKind == JsonValueKind.Array &&
                choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("delta", out var delta))
            {
                if (delta.TryGetProperty("content", out var contentProp) &&
                    contentProp.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrEmpty(contentProp.GetString()))
                {
                    return (contentProp.GetString(), false);
                }

                if ((delta.TryGetProperty("reasoning_content", out var reasoningProp) ||
                     delta.TryGetProperty("reasoning", out reasoningProp)) &&
                    reasoningProp.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrEmpty(reasoningProp.GetString()))
                {
                    return (reasoningProp.GetString(), true);
                }
            }
        }
        catch (JsonException)
        {
            // Ignore malformed JSON chunks.
        }

        return (null, false);
    }

    /// <summary>
    /// Extracts the top-level <c>usage</c> object (<c>prompt_tokens</c> / <c>completion_tokens</c>)
    /// from one SSE payload. OpenAI-compatible providers put it on the final chunk; Hermes
    /// mirrors the same shape. Returns <c>null</c> for a chunk without usage or malformed JSON.
    /// </summary>
    private static (int Prompt, int Completion)? TryExtractUsage(string data)
    {
        try
        {
            using var doc = JsonDocument.Parse(data);
            if (!doc.RootElement.TryGetProperty("usage", out var usage) ||
                usage.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (!usage.TryGetProperty("prompt_tokens", out var promptProp) ||
                promptProp.ValueKind != JsonValueKind.Number ||
                !usage.TryGetProperty("completion_tokens", out var completionProp) ||
                completionProp.ValueKind != JsonValueKind.Number)
            {
                return null;
            }

            var prompt = promptProp.GetInt32();
            var completion = completionProp.GetInt32();
            if (prompt < 0 || completion < 0) return null;

            return (prompt, completion);
        }
        catch (JsonException)
        {
            // Ignore malformed JSON chunks.
        }

        return null;
    }
}
