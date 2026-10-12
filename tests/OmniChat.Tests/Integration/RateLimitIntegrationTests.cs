using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

public class RateLimitIntegrationTests
{
    // A body that fails model validation (empty model + empty messages) — cheap to serve (400)
    // but still consumes a rate-limit token, so it drives the token bucket quickly.
    private static HttpContent InvalidBody() =>
        new StringContent("""{"model":"","messages":[]}""", Encoding.UTF8, "application/json");

    [Fact]
    public async Task ChatStream_ExceedingTokenBucket_Returns429()
    {
        // Fresh factory per test → isolated rate-limiter partition state.
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        // The per-ip bucket allows 10 requests; each of these is validated (400) but not throttled.
        for (var i = 0; i < 10; i++)
        {
            using var allowed = await client.PostAsync("/api/chat/stream", InvalidBody());
            Assert.Equal(HttpStatusCode.BadRequest, allowed.StatusCode);
        }

        // The 11th request exhausts the bucket and must be rejected by the rate limiter.
        using var throttled = await client.PostAsync("/api/chat/stream", InvalidBody());
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    [Fact]
    public async Task ChatStream_CustomRateLimit_Returns429AtConfiguredThreshold()
    {
        // Override RateLimit:TokenLimit to 2 so the bucket is small enough to exhaust
        // quickly without firing 10 requests. ReplenishmentPeriod=3600 prevents tokens
        // from refilling during the test.
        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder => builder
                .UseSetting("RateLimit:TokenLimit", "2")
                .UseSetting("RateLimit:ReplenishmentPeriodSeconds", "3600"));
        using var client = factory.CreateClient();

        // 2 requests fit within the custom token limit.
        for (var i = 0; i < 2; i++)
        {
            using var allowed = await client.PostAsync("/api/chat/stream", InvalidBody());
            Assert.Equal(HttpStatusCode.BadRequest, allowed.StatusCode);
        }

        // The 3rd request exhausts the 2-token bucket and must be rejected.
        using var throttled = await client.PostAsync("/api/chat/stream", InvalidBody());
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }
}
