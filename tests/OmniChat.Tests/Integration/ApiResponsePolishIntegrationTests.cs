using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Integration tests for Milestone 14 API response quality polish:
/// rate-limit Retry-After header, response compression, model catalog cache headers.
/// </summary>
public class ApiResponsePolishIntegrationTests
{
    // ── Rate-limit Retry-After header ──

    private static HttpContent InvalidBody() =>
        new StringContent("""{"model":"","messages":[]}""", Encoding.UTF8, "application/json");

    [Fact]
    public async Task RateLimited429_ReturnsRetryAfterHeader()
    {
        // Fresh factory → isolated token-bucket partition state.
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        // Exhaust the 10-token bucket.
        for (var i = 0; i < 10; i++)
        {
            using var allowed = await client.PostAsync("/api/chat/stream", InvalidBody());
            Assert.Equal(HttpStatusCode.BadRequest, allowed.StatusCode);
        }

        // 11th request → 429 with Retry-After header.
        using var throttled = await client.PostAsync("/api/chat/stream", InvalidBody());
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.True(throttled.Headers.Contains("Retry-After"),
            "429 response must include a Retry-After header so clients know how long to wait.");
    }

    [Fact]
    public async Task RateLimited429_ReturnsProblemDetailsBody()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        for (var i = 0; i < 10; i++)
        {
            using var allowed = await client.PostAsync("/api/chat/stream", InvalidBody());
            Assert.Equal(HttpStatusCode.BadRequest, allowed.StatusCode);
        }

        using var throttled = await client.PostAsync("/api/chat/stream", InvalidBody());
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.NotNull(throttled.Content.Headers.ContentType);
        Assert.Equal("application/problem+json", throttled.Content.Headers.ContentType!.MediaType);
        var body = await throttled.Content.ReadAsStringAsync();
        Assert.Contains("\"title\"", body);
        Assert.Contains("\"traceId\"", body);
    }

    // ── Response compression ──

    [Fact]
    public async Task HealthEndpoint_WithAcceptEncodingGzip_ReturnsCompressedResponse()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Content.Headers.ContentEncoding.Contains("gzip"),
            "Response should be gzip-compressed when Accept-Encoding: gzip is sent.");
    }

    [Fact]
    public async Task HealthEndpoint_WithAcceptEncodingBrotli_ReturnsCompressedResponse()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Content.Headers.ContentEncoding.Contains("br"),
            "Response should be brotli-compressed when Accept-Encoding: br is sent.");
    }

    // ── Model catalog cache headers ──

    [Fact]
    public async Task GetModels_ReturnsCacheControlHeader()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/models");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cacheControl = response.Headers.CacheControl;
        Assert.NotNull(cacheControl);
        Assert.True(cacheControl!.MaxAge?.TotalSeconds == 60,
            "GetModels should set Cache-Control max-age=60 for short client-side caching.");
        Assert.True(cacheControl.Public,
            "GetModels Cache-Control should be public so CDN/browser caches can store it.");
    }
}
