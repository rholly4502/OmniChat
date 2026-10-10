using System.ComponentModel.DataAnnotations;

namespace OmniChat.Domain.Models;

public record ChatMessage(string Role, string Content);

public class ChatRequest
{
    [Required(ErrorMessage = "Model is required.")]
    public string Model { get; set; } = "default";

    [Required(ErrorMessage = "Messages cannot be empty.")]
    [MinLength(1, ErrorMessage = "At least one message is required.")]
    public List<ChatMessage> Messages { get; set; } = [];

    public bool UseHermesBridge { get; set; } = true;
}