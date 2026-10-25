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

    [Range(0.0, 2.0, ErrorMessage = "Temperature must be between 0.0 and 2.0.")]
    public double? Temperature { get; set; }

    [Range(1, 32000, ErrorMessage = "MaxTokens must be between 1 and 32000.")]
    public int? MaxTokens { get; set; }
}
