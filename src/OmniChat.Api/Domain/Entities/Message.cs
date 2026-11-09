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
    /// <summary>Whether the user bookmarked this turn (audit; a star in the transcript).</summary>
    public bool IsBookmarked { get; set; }

    /// <summary>Input tokens billed to this specific assistant turn (from the stream's usage frame).</summary>
    public int PromptTokens { get; set; }

    /// <summary>Output tokens billed to this specific assistant turn (from the stream's usage frame).</summary>
    public int CompletionTokens { get; set; }

    /// <summary>
    /// Model id that produced this assistant turn. Persisted alongside the per-message usage so
    /// a reloaded conversation can still price the per-message cost footnote with the model that
    /// actually generated the reply (a conversation may span several models). Null on user turns
    /// and on replies whose provider never reported a model.
    /// </summary>
    public string? Model { get; set; }

    /// <summary>
    /// Chain-of-thought reasoning text for this turn, when the provider exposed it (e.g.
    /// reasoning models). Persisted so a reloaded conversation can still show the "Berpikir"
    /// disclosure that streamed live; null on user turns and on replies with no reasoning.
    /// </summary>
    public string? Reasoning { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
