namespace OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

/// <summary>
/// A single persisted turn within a <see cref="Conversation"/>.
/// </summary>
public class Message
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid ConversationId { get; set; }

    public Conversation? Conversation { get; set; }

    /// <summary>"user", "assistant" or "system" — same vocabulary as the API contract.</summary>
    public string Role { get; set; } = "user";

    public string Content { get; set; } = string.Empty;

    /// <summary>User rating of this turn (audit). Null means unrated.</summary>
    public MessageFeedback? Feedback { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
