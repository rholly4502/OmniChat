using OmniChat.Domain.Entities;

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
    /// has no history.
    /// </summary>
    Task<IReadOnlyList<Conversation>> ListConversationsAsync(string userId, int limit = 50, CancellationToken cancellationToken = default);

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
}
