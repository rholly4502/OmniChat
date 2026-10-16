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

    /// <summary>Value used when <see cref="ProgressIntervalSeconds"/> is unset or non-positive.</summary>
    public const int DefaultProgressIntervalSeconds = 10;

    /// <summary>
    /// Emit a progress frame on an idle upstream stream after this many seconds of silence.
    /// </summary>
    /// <remarks>
    /// The first token of an Agent-mode reply only arrives once the whole agent loop has
    /// finished, so without a heartbeat the client cannot tell a working agent from a dead
    /// request. This is deliberately an order of magnitude shorter than
    /// <see cref="IdleTimeoutSeconds"/>: the heartbeat reassures, the idle deadline aborts.
    /// Zero or negative disables the heartbeat entirely.
    /// </remarks>
    public int ProgressIntervalSeconds { get; set; } = DefaultProgressIntervalSeconds;

    /// <summary>The heartbeat interval, or <c>null</c> when disabled.</summary>
    public TimeSpan? ProgressInterval =>
        ProgressIntervalSeconds > 0 ? TimeSpan.FromSeconds(ProgressIntervalSeconds) : null;

    /// <summary>The deadline, or <c>null</c> when disabled.</summary>
    public TimeSpan? IdleTimeout =>
        IdleTimeoutSeconds > 0 ? TimeSpan.FromSeconds(IdleTimeoutSeconds) : null;
}
