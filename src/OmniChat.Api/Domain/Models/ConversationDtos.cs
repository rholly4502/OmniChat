using System.ComponentModel.DataAnnotations;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

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
    DateTimeOffset UpdatedAt,
    bool IsPinned,
    bool IsArchived,
    int PromptTokens,
    int CompletionTokens,
    int TotalTokens,
    string? Preview)
{
    /// <summary>Longest preview rendered under a conversation title in the sidebar.</summary>
    public const int PreviewMaxLength = 80;

    public static ConversationSummary From(Conversation conversation, string? preview = null)
    {
        ArgumentNullException.ThrowIfNull(conversation);

        return new ConversationSummary(
            conversation.Id,
            conversation.Title,
            conversation.Mode,
            conversation.Model,
            conversation.CreatedAt,
            conversation.UpdatedAt,
            conversation.IsPinned,
            conversation.IsArchived,
            conversation.PromptTokens,
            conversation.CompletionTokens,
            conversation.PromptTokens + conversation.CompletionTokens,
            TruncatePreview(preview));
    }

    /// <summary>
    /// Collapses whitespace and cuts a preview on a word boundary so a sidebar row
    /// stays one compact line. Null/blank input maps to null (the sidebar hides the
    /// preview line rather than rendering an empty one).
    /// </summary>
    private static string? TruncatePreview(string? preview)
    {
        if (string.IsNullOrWhiteSpace(preview)) return null;
        var clean = string.Join(' ', preview.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (clean.Length <= PreviewMaxLength) return clean;
        var cut = clean.LastIndexOf(' ', PreviewMaxLength);
        var end = cut > PreviewMaxLength / 2 ? cut : PreviewMaxLength;
        return string.Concat(clean.AsSpan(0, end).TrimEnd(), "…");
    }
}

/// <summary>One replayed turn inside <see cref="ConversationDetail"/>.</summary>
public sealed record ConversationMessage(
    Guid Id,
    string Role,
    string Content,
    DateTimeOffset CreatedAt,
    MessageFeedback? Feedback,
    int PromptTokens,
    int CompletionTokens,
    string? Model)
{
    public static ConversationMessage From(Message message)
    {
        ArgumentNullException.ThrowIfNull(message);

        return new ConversationMessage(
            message.Id,
            message.Role,
            message.Content,
            message.CreatedAt,
            message.Feedback,
            message.PromptTokens,
            message.CompletionTokens,
            message.Model);
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
    bool IsArchived,
    int PromptTokens,
    int CompletionTokens,
    int TotalTokens,
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
            conversation.IsArchived,
            conversation.PromptTokens,
            conversation.CompletionTokens,
            conversation.PromptTokens + conversation.CompletionTokens,
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

/// <summary>Body of <c>PUT /api/conversations/{id}/settings</c>.</summary>
public sealed class UpdateConversationSettingsRequest
{
    /// <summary>
    /// Model id to persist for the conversation. When null, the model is left as is.
    /// </summary>
    [MaxLength(100)]
    public string? Model { get; set; }

    /// <summary>
    /// Chat mode to persist: <c>"agent"</c> or <c>"direct"</c>. When null, the mode is left as is.
    /// </summary>
    [RegularExpression("^(agent|direct)$")]
    public string? Mode { get; set; }
}

/// <summary>Body of <c>PUT /api/conversations/{id}/pin</c>.</summary>

/// <summary>Per-model token subtotals within a {@link ConversationUsageSummary}.</summary>
public sealed record ConversationModelUsage(int PromptTokens, int CompletionTokens)
{
    public int TotalTokens => PromptTokens + CompletionTokens;
}

/// <summary>
/// Aggregate token usage across all of a caller's stored conversations. An admin
/// uses this as the audit overview; a guest always sees the empty shape, exactly
/// as a guest never sees history rows.
/// </summary>
public sealed record ConversationUsageSummary(
    int TotalPromptTokens,
    int TotalCompletionTokens,
    int TotalTokens,
    int ConversationCount,
    int TotalUpFeedback,
    int TotalDownFeedback,
    IReadOnlyDictionary<string, ConversationModelUsage> ByModel)
{
    public static ConversationUsageSummary Empty { get; } = new(
        0, 0, 0, 0, 0, 0, new Dictionary<string, ConversationModelUsage>());
}

public sealed class PinConversationRequest
{
    /// <summary>Pin state to apply. Pinned conversations sort to the top of the sidebar.</summary>
    public bool IsPinned { get; set; }
}

/// <summary>Body of <c>PUT /api/conversations/{id}/archive</c>.</summary>
public sealed class ArchiveConversationRequest
{
    /// <summary>Archive state to apply. Archived conversations hide from the default history list.</summary>
    public bool IsArchived { get; set; }
}

/// <summary>Body of <c>PUT /api/conversations/{id}/messages/{messageId}/feedback</c>.</summary>
public sealed class MessageFeedbackRequest
{
    /// <summary>
    /// The rating to store: <c>"up"</c>, <c>"down"</c>, or <c>null</c> to clear an
    /// earlier rating. Any other string is rejected with a 400.
    /// </summary>
    public string? Feedback { get; set; }
}
