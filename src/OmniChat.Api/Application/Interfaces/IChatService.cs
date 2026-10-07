using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

public interface IChatService
{
    IAsyncEnumerable<string> StreamChatResponseAsync(ChatRequest request, CancellationToken cancellationToken = default);
}
