namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Bound from the <c>Hermes</c> configuration section. Describes the Hermes agent gateway
/// that OmniChat proxies to in Agent Mode.
/// </summary>
public sealed class HermesOptions
{
    public const string SectionName = "Hermes";

    /// <summary>Default deadline (in seconds) for non-streaming Hermes gateway requests.</summary>
    public const int DefaultDraftTimeoutSeconds = 90;

    /// <summary>Full URL of the Hermes OpenAI-compatible chat-completions endpoint.</summary>
    public string Endpoint { get; set; } = "http://localhost:5000/v1/chat/completions";

    /// <summary>Bearer token sent to the Hermes API server. Empty means "send no Authorization header".</summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Abort a non-streaming Hermes gateway request (such as cover-letter draft generation)
    /// after this many seconds. Zero or negative disables the deadline.
    /// </summary>
    public int DraftTimeoutSeconds { get; set; } = DefaultDraftTimeoutSeconds;

    /// <summary>The non-streaming request deadline, or <c>null</c> when disabled.</summary>
    public TimeSpan? DraftTimeout =>
        DraftTimeoutSeconds > 0 ? TimeSpan.FromSeconds(DraftTimeoutSeconds) : null;
}
