namespace OmniChat.Domain.Models;

public record ChatMessage(string Role, string Content);

public class ChatRequest
{
    public string Model { get; set; } = "default";
    public List<ChatMessage> Messages { get; set; } = [];
    public bool UseHermesBridge { get; set; } = true;
}
