using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using System.Runtime.CompilerServices;

namespace OmniChat.Infrastructure.Services;

public class ChatService : IChatService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;

    public ChatService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    public async IAsyncEnumerable<string> StreamChatResponseAsync(
        ChatRequest request, 
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        // Jika UseHermesBridge true, arahkan ke Hermes Gateway (localhost:5000/v1)
        // Jika false, bisa langsung ke OpenRouter / OpenAI
        var endpoint = request.UseHermesBridge 
            ? "http://localhost:5000/v1/chat/completions" 
            : "https://openrouter.ai/api/v1/chat/completions";

        // Simulasi / Implementasi streaming placeholder yang robust untuk .NET 10
        yield return "Halo Rholly! ";
        await Task.Delay(200, cancellationToken);
        yield return "Ini adalah respons streaming dari backend .NET 10 ";
        await Task.Delay(200, cancellationToken);
        yield return request.UseHermesBridge ? "menggunakan Hermes Agent Gateway." : "menggunakan Direct LLM Provider.";
    }
}
