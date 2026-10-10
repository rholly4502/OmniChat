using System.Runtime.CompilerServices;
using System.Threading.Channels;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using System.Text;
using System.Text.Json;

namespace OmniChat.Infrastructure.Services;

public class ChatService : IChatService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ChatService> _logger;

    public ChatService(IHttpClientFactory httpClientFactory, IConfiguration configuration, ILogger<ChatService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    // yield return TIDAK boleh di dalam try-catch (CS1626/CS1631).
    // Solusi: pattern Channel — producer task makan error di try-catch,
    // iterator hanya membaca channel yang sudah bersih.
    public async IAsyncEnumerable<string> StreamChatResponseAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var channel = Channel.CreateUnbounded<string>();
        var producer = Task.Run(() => ProduceTokensAsync(channel.Writer, request, cancellationToken), cancellationToken);

        await foreach (var token in channel.Reader.ReadAllAsync(cancellationToken))
        {
            yield return token;
        }

        await producer; // propagate cancellation/exception akhir bila perlu
    }

    private async Task ProduceTokensAsync(ChannelWriter<string> writer, ChatRequest request, CancellationToken ct)
    {
        try
        {
            var endpoint = request.UseHermesBridge
                ? _configuration["Hermes:Endpoint"] ?? "http://localhost:5000/v1/chat/completions"
                : _configuration["LLM:Endpoint"] ?? "https://openrouter.ai/api/v1/chat/completions";

            var client = _httpClientFactory.CreateClient("LLMClient");

            var payload = new
            {
                model = request.Model,
                messages = request.Messages.Select(m => new { role = m.Role, content = m.Content }),
                stream = true
            };

            var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };

            if (!request.UseHermesBridge)
            {
                var apiKey = _configuration["LLM:ApiKey"];
                if (!string.IsNullOrEmpty(apiKey))
                {
                    httpRequest.Headers.Add("Authorization", $"Bearer {apiKey}");
                }
            }

            using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("LLM API error: {StatusCode} - {Content}", response.StatusCode, errorContent);
                await writer.WriteAsync($"[Error: Provider responded with status {response.StatusCode}]", ct);
                writer.TryComplete();
                return;
            }

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync(ct)) != null)
            {
                ct.ThrowIfCancellationRequested();

                if (string.IsNullOrWhiteSpace(line)) continue;
                if (!line.StartsWith("data: ")) continue;

                var data = line["data: ".Length..].Trim();
                if (data == "[DONE]") break;

                try
                {
                    using var doc = JsonDocument.Parse(data);
                    if (doc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                    {
                        var firstChoice = choices[0];
                        if (firstChoice.TryGetProperty("delta", out var delta) &&
                            delta.TryGetProperty("content", out var contentProp))
                        {
                            var text = contentProp.GetString();
                            if (!string.IsNullOrEmpty(text))
                            {
                                await writer.WriteAsync(text, ct);
                            }
                        }
                    }
                }
                catch (JsonException)
                {
                    // Ignore malformed JSON chunks
                }
            }

            writer.TryComplete();
        }
        catch (OperationCanceledException)
        {
            writer.TryComplete();
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to connect to LLM/Hermes endpoint. Falling back to simulation mode.");
            await writer.WriteAsync("Halo Rholly! [Fallback Mode] ", CancellationToken.None);
            await Task.Delay(150, CancellationToken.None);
            await writer.WriteAsync("Backend OmniChat .NET 10 berhasil memproses request Anda ", CancellationToken.None);
            await Task.Delay(150, CancellationToken.None);
            await writer.WriteAsync(request.UseHermesBridge ? "via Hermes Bridge." : "via Direct Provider.", CancellationToken.None);
            writer.TryComplete();
        }
    }
}
