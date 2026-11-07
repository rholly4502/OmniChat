using System.ComponentModel.DataAnnotations;

namespace OmniChat.Domain.Models;

/// <summary>
/// A single message in a chat conversation.
/// </summary>
/// <param name="Role">Conversation role: "user", "assistant", or "system".</param>
/// <param name="Content">Message text (max 8000 characters).</param>
public class ChatMessage
{
    [Required(ErrorMessage = "Role is required.")]
    [RegularExpression("^(user|assistant|system)$", ErrorMessage = "Role must be 'user', 'assistant', or 'system'.")]
    public string Role { get; set; } = string.Empty;

    [Required(ErrorMessage = "Content is required.")]
    [MaxLength(8000, ErrorMessage = "Content cannot exceed 8000 characters.")]
    public string Content { get; set; } = string.Empty;

    public ChatMessage() { }

    public ChatMessage(string role, string content)
    {
        Role = role;
        Content = content;
    }
}

/// <summary>
/// Expresses that the client wants to replace part of a stored conversation rather than
/// append a fresh turn. Sent when the user regenerates the last reply or edits a past user
/// turn and re-sends it, so the server transcript matches what the client shows — instead of
/// piling up a duplicate user turn and the discarded replies after a reload.
/// </summary>
public class ChatRewind
{
    /// <summary>"Either "regenerate" (re-run the last turn) or "edit" (rewrite a past user turn).</summary>
    [Required(ErrorMessage = "Rewind type is required.")]
    [RegularExpression("^(regenerate|edit)$", ErrorMessage = "Rewind type must be 'regenerate' or 'edit'.")]
    public string Type { get; set; } = string.Empty;

    /// <summary>For "edit": the server id of the user message being rewritten.</summary>
    public Guid? MessageId { get; set; }

    /// <summary>For "edit": the replacement content for that user message.</summary>
    [MaxLength(8000, ErrorMessage = "Content cannot exceed 8000 characters.")]
    public string? Content { get; set; }
}

public class ChatRequest
{
    [Required(ErrorMessage = "Model is required.")]
    [MaxLength(100, ErrorMessage = "Model name cannot exceed 100 characters.")]
    public string Model { get; set; } = "default";

    [Required(ErrorMessage = "Messages cannot be empty.")]
    [MinLength(1, ErrorMessage = "At least one message is required.")]
    [MaxLength(50, ErrorMessage = "Cannot exceed 50 messages per request.")]
    public List<ChatMessage> Messages { get; set; } = [];

    public bool UseHermesBridge { get; set; } = true;

    /// <summary>
    /// Conversation to append this turn to. Omit (or send <c>null</c>) to start a new one; the
    /// server reports the id it used in a <c>{"conversationId":"..."}</c> SSE frame.
    /// </summary>
    public Guid? ConversationId { get; set; }

    /// <summary>
    /// Optional instruction to replace part of the stored conversation (regenerate / edit).
    /// Omit for a normal append.
    /// </summary>
    public ChatRewind? Rewind { get; set; }

    [Range(0.0, 2.0, ErrorMessage = "Temperature must be between 0.0 and 2.0.")]
    public double? Temperature { get; set; }

    [Range(1, 32000, ErrorMessage = "MaxTokens must be between 1 and 32000.")]
    public int? MaxTokens { get; set; }
}
