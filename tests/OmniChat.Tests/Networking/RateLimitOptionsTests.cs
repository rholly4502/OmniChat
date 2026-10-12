using Microsoft.Extensions.Configuration;
using OmniChat.Api.Infrastructure.Networking;

namespace OmniChat.Tests.Networking;

/// <summary>
/// Unit tests for <see cref="RateLimitOptions"/>. Pins the default values
/// (so existing deployments without the new env vars keep the old 10 req/min
/// behaviour) and verifies that configuration overrides bind correctly.
/// </summary>
public class RateLimitOptionsTests
{
    [Fact]
    public void SectionName_IsRateLimit()
    {
        Assert.Equal("RateLimit", RateLimitOptions.SectionName);
    }

    [Fact]
    public void Defaults_MatchLegacyHardcodedValues()
    {
        // Backward compatibility: the old hardcoded values were 10 tokens / 60 seconds.
        // If these defaults change, existing deployments without the new env vars
        // would silently get different rate limits.
        var opts = new RateLimitOptions();
        Assert.Equal(10, opts.TokenLimit);
        Assert.Equal(60, opts.ReplenishmentPeriodSeconds);
    }

    [Fact]
    public void Bind_FromConfiguration_AppliesCustomValues()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimit:TokenLimit"] = "5",
                ["RateLimit:ReplenishmentPeriodSeconds"] = "120",
            })
            .Build();

        var opts = config.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>()!;

        Assert.Equal(5, opts.TokenLimit);
        Assert.Equal(120, opts.ReplenishmentPeriodSeconds);
    }

    [Fact]
    public void Bind_WithEmptyConfiguration_FallsBackToDefaults()
    {
        // When the RateLimit section is absent, Get<T>() returns null — exactly
        // like Program.cs, the ?? new() fallback provides the default values.
        var config = new ConfigurationBuilder().Build();
        var opts = config.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>()
            ?? new RateLimitOptions();

        Assert.Equal(10, opts.TokenLimit);
        Assert.Equal(60, opts.ReplenishmentPeriodSeconds);
    }
}
