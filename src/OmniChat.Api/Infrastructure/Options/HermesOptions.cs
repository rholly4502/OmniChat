namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Bound from the <c>Hermes</c> configuration section. Describes the Hermes agent gateway
/// that OmniChat proxies to in Agent Mode.
/// </summary>
public sealed class HermesOptions
{
    public const string SectionName = "Hermes";

    /// <summary>Full URL of the Hermes OpenAI-compatible chat-completions endpoint.</summary>
    public string Endpoint { get; set; } = "http://localhost:5000/v1/chat/completions";

    /// <summary>Bearer token sent to the Hermes API server. Empty means "send no Authorization header".</summary>
    public string? ApiKey { get; set; }
}
