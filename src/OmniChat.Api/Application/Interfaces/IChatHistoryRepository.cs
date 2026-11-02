using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Persistence port for chat history. Implemented by the infrastructure layer
/// (<c>Infrastructure.Data.ChatHistoryRepository</c>) so the application and API
/// layers never reference EF Core or a concrete database.
/// </summary>
/// <remarks>
/// Every method takes the owning <c>userId</c> where a row is addressed by id. Scoping
/// the lookup by owner inside the repository — rather than filtering afterwards at the
/// call site — means a forgotten check cannot leak another user's conversation: an
/// unowned id simply reads as "not found".
/// </remarks>
public interface IChatHistoryRepository
{
    /// <summary>Persists a new conversation and returns it with its generated id.</summary>
    Task<Conversation> CreateConversationAsync(Conversation conversation, CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads one conversation including its messages in chronological order, or
    /// <c>null</c> when it does not exist or belongs to another user.
    /// </summary>
    Task<Conversation?> GetConversationAsync(Guid id, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Lists a user's conversation summaries (no message bodies), most recently
    /// updated first. Returns an empty list rather than <c>null</c> when the user
    /// has no history. When <paramref name="search"/> is non-blank, only
    /// conversations whose title or a contained message matches the term are
    /// returned. <paramref name="model"/> narrows to a stored model id;
    /// <paramref name="from"/> and <paramref name="to"/> bound the updated-at
    /// window (the latter inclusive).
    /// </summary>
    Task<IReadOnlyList<Conversation>> ListConversationsAsync(
        string userId,
        int limit = 50,
        string? search = null,
        string? model = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Appends a turn and advances the parent conversation's <c>UpdatedAt</c>.
    /// Throws <see cref="InvalidOperationException"/> when the conversation does not
    /// belong to <paramref name="userId"/>.
    /// </summary>
    Task<Message> AppendMessageAsync(Guid conversationId, string userId, Message message, CancellationToken cancellationToken = default);

    /// <summary>Renames a conversation. Returns <c>false</c> when not found or not owned.</summary>
    Task<bool> RenameConversationAsync(Guid id, string userId, string title, CancellationToken cancellationToken = default);

    /// <summary>Pins or unpins a conversation. Returns <c>false</c> when not found or not owned.</summary>
    Task<bool> PinConversationAsync(Guid id, string userId, bool isPinned, CancellationToken cancellationToken = default);

    /// <summary>Deletes a conversation and its messages. Returns <c>false</c> when not found or not owned.</summary>
    Task<bool> DeleteConversationAsync(Guid id, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the model a conversation will resume with. Returns <c>false</c> when the
    /// conversation does not exist or does not belong to <paramref name="userId"/>.
    /// </summary>
    Task<bool> SetConversationModelAsync(
        Guid id,
        string userId,
        string model,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Accumulates upstream token usage onto a conversation. Returns <c>false</c> when the
    /// conversation does not exist or does not belong to <paramref name="userId"/>.
    /// </summary>
    /// <summary>
    /// Aggregates token usage across all of the caller's conversations (no message
    /// bodies). Always returns a summary — a caller with no history gets all-zero
    /// totals and an empty per-model breakdown.
    /// </summary>
    Task<ConversationUsageSummary> GetUsageSummaryAsync(string userId, CancellationToken cancellationToken = default);

    Task<bool> AddConversationUsageAsync(
        Guid conversationId,
        string userId,
        int promptTokens,
        int completionTokens,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets or clears the caller's rating on one message inside their conversation.
    /// Returns <c>false</c> when the message does not exist or belongs to another user
    /// (the same 404-shaped answer as a missing conversation).
    /// </summary>
    Task<bool> SetMessageFeedbackAsync(
        Guid conversationId,
        Guid messageId,
        string userId,
        MessageFeedback? feedback,
        CancellationToken cancellationToken = default);
}

