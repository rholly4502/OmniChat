namespace OmniChat.Api.Infrastructure.Networking;

/// <summary>
/// Configuration options for the per-IP token-bucket rate limiter.
/// All values fall back to safe defaults so existing deployments without
/// these settings continue to work unchanged.
/// </summary>
public sealed class RateLimitOptions
{
    public const string SectionName = "RateLimit";

    /// <summary>
    /// Maximum tokens (requests) allowed per period per client IP.
    /// Default: 10.
    /// </summary>
    public int TokenLimit { get; set; } = 10;

    /// <summary>
    /// Replenishment period in seconds. Tokens refill to <see cref="TokenLimit"/>
    /// over this interval. Default: 60 (one minute).
    /// </summary>
    public int ReplenishmentPeriodSeconds { get; set; } = 60;
}
