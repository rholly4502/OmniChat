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
/// [OI]-compatible provider (Direct Mode), normalising both to a plain token stream.
/// </summary>
public sealed class ChatService : IChatService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly HermesOptions _hermes;
    private readonly LlmOptions _llm;
    private readonly ILogger<ChatService> _logger;

    public ChatService(
        IHttpClientFactory httpClientFactory,
        IOptions<HermesOptions> hermes,
        IOptions<LlmOptions> llm,
        ILogger<ChatService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _hermes = hermes.Value;
        _llm = llm.Value;
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
        try
        {
            var (endpoint, apiKey) = request.UseHermesBridge
                ? (_hermes.Endpoint, _hermes.ApiKey)
                : (_llm.Endpoint, _llm.ApiKey);

            var client = _httpClientFactory.CreateClient("LLMClient");

            var payload = new
            {
                model = request.Model,
                messages = request.Messages.Select(m => new { role = m.Role, content = m.Content }),
                stream = true
            };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(apiKey))
            {
                httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            }

            using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);

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

            string? line;
            while ((line = await reader.ReadLineAsync(ct)) != null)
            {
                ct.ThrowIfCancellationRequested();

                if (string.IsNullOrWhiteSpace(line)) continue;
                if (!line.StartsWith("data: ")) continue;

                var data = line["data: ".Length..].Trim();
                if (data == "[DONE]") break;

                var text = TryExtractDeltaContent(data);
                if (!string.IsNullOrEmpty(text))
                {
                    await writer.WriteAsync(text, ct);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected or the host is shutting down — nothing to report.
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reach the configured {Mode} endpoint at {Endpoint}.",
                request.UseHermesBridge ? "Hermes" : "LLM",
                request.UseHermesBridge ? _hermes.Endpoint : _llm.Endpoint);

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
    /// Extracts <c>choices[0].delta.content</c> from one SSE payload.
    /// Returns <c>null</c> for keep-alives, role-only deltas and malformed JSON.
    /// </summary>
    private static string? TryExtractDeltaContent(string data)
    {
        try
        {
            using var doc = JsonDocument.Parse(data);
            if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                choices.ValueKind == JsonValueKind.Array &&
                choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("delta", out var delta) &&
                delta.TryGetProperty("content", out var contentProp) &&
                contentProp.ValueKind == JsonValueKind.String)
            {
                return contentProp.GetString();
            }
        }
        catch (JsonException)
        {
            // Ignore malformed JSON chunks.
        }

        return null;
    }
}
