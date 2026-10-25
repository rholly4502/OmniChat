namespace OmniChat.Domain.Entities;

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

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
