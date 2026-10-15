namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Bound from the <c>Streaming</c> configuration section. Controls the liveness deadline for
/// the upstream token stream that both Agent Mode and Direct Mode read from.
/// </summary>
public sealed class StreamingOptions
{
    public const string SectionName = "Streaming";

    /// <summary>Value used when <see cref="IdleTimeoutSeconds"/> is unset or non-positive.</summary>
    public const int DefaultIdleTimeoutSeconds = 120;

    /// <summary>
    /// Abort the upstream call after this many seconds with no bytes received. The deadline is
    /// reset on every line read, so it catches both "no first token ever arrived" and "the
    /// stream stalled mid-answer" while never cutting a busy generation short.
    /// </summary>
    /// <remarks>
    /// The named HttpClient deliberately has <c>Timeout.InfiniteTimeSpan</c> because a valid
    /// generation may stream for minutes and <see cref="HttpClient.Timeout"/> would abort it.
    /// Without this separate deadline a black-holed upstream — one that accepts the request and
    /// then sends nothing — would leave the request hanging indefinitely. Zero or negative
    /// disables the deadline entirely.
    /// </remarks>
    public int IdleTimeoutSeconds { get; set; } = DefaultIdleTimeoutSeconds;

    /// <summary>The deadline, or <c>null</c> when disabled.</summary>
    public TimeSpan? IdleTimeout =>
        IdleTimeoutSeconds > 0 ? TimeSpan.FromSeconds(IdleTimeoutSeconds) : null;
}
