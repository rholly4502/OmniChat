namespace OmniChat.Api.Infrastructure.Health;

/// <summary>
/// Captures the moment the service started so health/status endpoints can report uptime.
/// Registered as a singleton.
/// </summary>
public sealed class ServiceStartTime
{
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;

    public TimeSpan Uptime => DateTimeOffset.UtcNow - StartedAt;
}
