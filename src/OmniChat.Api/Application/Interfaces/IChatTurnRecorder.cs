namespace OmniChat.Application.Interfaces;

/// <summary>
/// One turn as the streaming endpoint sees it: the prompt the user just sent plus the
/// routing metadata needed to file it under a conversation.
/// </summary>
/// <param name="ConversationId">Existing conversation to append to, or <c>null</c> to start a new one.</param>
/// <param name="UserId">Owner tag (JWT subject, or <c>admin</c> for API-key callers).</param>
/// <param name="Mode">"agent" (Hermes Bridge) or "direct" (upstream LLM).</param>
/// <param name="Model">Model id the request asked for.</param>
/// <param name="UserContent">The user's message text.</param>
public sealed record ChatTurn(
    Guid? ConversationId,
    string UserId,
    string Mode,
    string Model,
    string UserContent);

/// <summary>
/// Records chat turns into conversation history. Separate from
/// <see cref="IChatHistoryRepository"/> on purpose: the repository is the storage port and is
/// only registered when persistence is enabled, while this port sits on the hot streaming path
/// and therefore always has an implementation — a no-op one when persistence is off.
/// </summary>
/// <remarks>
/// Neither method throws. A database that is slow, locked or gone must not fail a chat request
/// that would otherwise have streamed fine, so both methods swallow infrastructure failures,
/// log them, and report "not recorded" instead. Callers must treat the history as best-effort.
/// </remarks>
public interface IChatTurnRecorder
{
    /// <summary>
    /// Stores the user's half of the turn. Creates the conversation when
    /// <see cref="ChatTurn.ConversationId"/> is <c>null</c>.
    /// </summary>
    /// <returns>The conversation id the turn belongs to, or <c>null</c> when it was not recorded.</returns>
    Task<Guid?> StartTurnAsync(ChatTurn turn, CancellationToken cancellationToken = default);

    /// <summary>
    /// Stores the assistant's half of the turn, including a partial reply when the stream was
    /// cut short. A blank reply is not written.
    /// </summary>
    Task CompleteTurnAsync(Guid conversationId, string userId, string assistantContent, CancellationToken cancellationToken = default);
}
