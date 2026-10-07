using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using System.Runtime.CompilerServices;
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

    public async IAsyncEnumerable<string> StreamChatResponseAsync(
        ChatRequest request, 
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
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

        var jsonContent = new StringContent(
            JsonSerializer.Serialize(payload), 
            Encoding.UTF8, 
            "application/json");

        HttpRequestMessage httpRequest;
        try
        {
            httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = jsonContent
            };

            if (!request.UseHermesBridge)
            {
                var apiKey = _configuration["LLM:ApiKey"];
                if (!string.IsNullOrEmpty(apiKey))
                {
                    httpRequest.Headers.Add("Authorization", $"Bearer {apiKey}");
                }
            }

            using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("LLM API error: {StatusCode} - {Content}", response.StatusCode, errorContent);
                yield return $"[Error: Provider responded with status {response.StatusCode}]";
                yield break;
            }

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new StreamReader(stream);

            while (!reader.EndOfStream)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(cancellationToken);

                if (string.IsNullOrWhiteSpace(line)) continue;

                if (line.StartsWith("data: "))
                {
                    var data = line["data: ".Length..].Trim();
                    if (data == "[DONE]") break;

                    try
                    {
                        using var doc = JsonDocument.Parse(data);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                        {
                            var firstChoice = choices[0];
                            if (firstChoice.TryGetProperty("delta", out var delta) &&
                                delta.TryGetProperty("content", out var contentProp))
                            {
                                var text = contentProp.GetString();
                                if (!string.IsNullOrEmpty(text))
                                {
                                    yield return text;
                                }
                            }
                        }
                    }
                    catch (JsonException)
                    {
                        // Ignore malformed JSON chunks
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to connect to LLM/Hermes endpoint. Falling back to simulation mode for development.");
            
            yield return "Halo Rholly! [Fallback Mode] ";
            await Task.Delay(150, cancellationToken);
            yield return "Backend OmniChat .NET 10 berhasil memproses request Anda ";
            await Task.Delay(150, cancellationToken);
            yield return request.UseHermesBridge ? "via Hermes Bridge." : "via Direct Provider.";
        }
    }
}
