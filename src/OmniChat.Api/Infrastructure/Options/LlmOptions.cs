namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Bound from the <c>LLM</c> configuration section. Describes the upstream provider called
/// directly in Direct Mode (OpenRouter and compatible APIs).
/// </summary>
public sealed class LlmOptions
{
    public const string SectionName = "LLM";

    /// <summary>Full URL of the provider's OpenAI-compatible chat-completions endpoint.</summary>
    public string Endpoint { get; set; } = "https://openrouter.ai/api/v1/chat/completions";

    /// <summary>Bearer token sent to the provider. Empty means "send no Authorization header".</summary>
    public string? ApiKey { get; set; }
}
