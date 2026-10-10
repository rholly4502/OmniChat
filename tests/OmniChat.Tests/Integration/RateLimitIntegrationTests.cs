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
}
