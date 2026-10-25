using System.ComponentModel.DataAnnotations;
using OmniChat.Domain.Entities;

namespace OmniChat.Domain.Models;

/// <summary>
/// One row of the sidebar history list: enough to render a title and resume the thread,
/// deliberately without message bodies.
/// </summary>
/// <remarks>
/// The entity is never returned directly. Serialising <see cref="Conversation"/> would ship every
/// message plus the storage-level <c>UserId</c> owner tag, which is not the client's business and
/// would grow the listing without bound as a conversation gets longer.
/// </remarks>
public sealed record ConversationSummary(
    Guid Id,
    string Title,
    string Mode,
    string Model,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static ConversationSummary From(Conversation conversation)
    {
        ArgumentNullException.ThrowIfNull(conversation);

        return new ConversationSummary(
            conversation.Id,
            conversation.Title,
            conversation.Mode,
            conversation.Model,
            conversation.CreatedAt,
            conversation.UpdatedAt);
    }
}

/// <summary>One replayed turn inside <see cref="ConversationDetail"/>.</summary>
public sealed record ConversationMessage(Guid Id, string Role, string Content, DateTimeOffset CreatedAt)
{
    public static ConversationMessage From(Message message)
    {
        ArgumentNullException.ThrowIfNull(message);

        return new ConversationMessage(message.Id, message.Role, message.Content, message.CreatedAt);
    }
}

/// <summary>A conversation with its full transcript, ordered oldest first for replay.</summary>
public sealed record ConversationDetail(
    Guid Id,
    string Title,
    string Mode,
    string Model,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<ConversationMessage> Messages)
{
    public static ConversationDetail From(Conversation conversation)
    {
        ArgumentNullException.ThrowIfNull(conversation);

        var messages = (conversation.Messages ?? [])
            .OrderBy(message => message.CreatedAt)
            .Select(ConversationMessage.From)
            .ToList();

        return new ConversationDetail(
            conversation.Id,
            conversation.Title,
            conversation.Mode,
            conversation.Model,
            conversation.CreatedAt,
            conversation.UpdatedAt,
            messages);
    }
}

/// <summary>Body of <c>PATCH /api/conversations/{id}</c>.</summary>
public sealed class RenameConversationRequest
{
    /// <summary>New display title. Trimmed before use; the repository caps it at 200 characters.</summary>
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
}
