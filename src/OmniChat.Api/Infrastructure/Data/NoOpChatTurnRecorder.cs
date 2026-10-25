using OmniChat.Application.Interfaces;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Records nothing. Registered when persistence is disabled so the streaming endpoint can keep
/// a required dependency without a null check on every turn.
/// </summary>
/// <remarks>
/// The repository gets no such treatment on purpose: a read endpoint that needs history must
/// fail loudly when it is not configured, whereas the streaming path must keep working. This
/// class is the difference between those two requirements.
/// </remarks>
public sealed class NoOpChatTurnRecorder : IChatTurnRecorder
{
    public Task<Guid?> StartTurnAsync(ChatTurn turn, CancellationToken cancellationToken = default) =>
        Task.FromResult<Guid?>(null);

    public Task CompleteTurnAsync(Guid conversationId, string userId, string assistantContent, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
