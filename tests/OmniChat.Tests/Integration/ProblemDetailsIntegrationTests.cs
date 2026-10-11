using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies that all error responses follow the RFC 7807 ProblemDetails format
/// with application/problem+json content type.
/// </summary>
public class ProblemDetailsIntegrationTests
{
    // ── Validation 400 → ValidationProblemDetails ──

    [Fact]
    public async Task Validation_400_ReturnsProblemJsonContentType()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var invalidBody = """{"model":"","messages":[]}""";
        var content = new StringContent(invalidBody, Encoding.UTF8, "application/json");

        var response = await client.PostAsync("/api/chat/stream", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.Equal("application/problem+json",
            response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Validation_400_BodyContainsProblemDetailsFields()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var invalidBody = """{"model":"","messages":[]}""";
        var content = new StringContent(invalidBody, Encoding.UTF8, "application/json");

        var response = await client.PostAsync("/api/chat/stream", content);
        var body = await response.Content.ReadAsStringAsync();

        // RFC 7807 ProblemDetails fields
        Assert.Contains("\"title\"", body);
        Assert.Contains("\"status\":400", body);
        Assert.Contains("\"errors\"", body);
        Assert.Contains("\"traceId\"", body);
    }

    // ── Auth 401 → ProblemDetails ──

    [Fact]
    public async Task Auth_401_ReturnsProblemJsonContentType()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory
            .WithWebHostBuilder(b => b.UseSetting("Security:ApiKey", "secret"))
            .CreateClient();

        var body = new StringContent(
            """{"model":"m","messages":[{"role":"user","content":"hi"}]}""",
            Encoding.UTF8, "application/json");

        var response = await client.PostAsync("/api/chat/stream", body);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.Equal("application/problem+json",
            response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Auth_401_BodyContainsProblemDetailsFields()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory
            .WithWebHostBuilder(b => b.UseSetting("Security:ApiKey", "secret"))
            .CreateClient();

        var body = new StringContent(
            """{"model":"m","messages":[{"role":"user","content":"hi"}]}""",
            Encoding.UTF8, "application/json");

        var response = await client.PostAsync("/api/chat/stream", body);
        var responseBody = await response.Content.ReadAsStringAsync();

        Assert.Contains("\"title\"", responseBody);
        Assert.Contains("\"status\":401", responseBody);
        Assert.Contains("\"detail\"", responseBody);
        Assert.Contains("\"traceId\"", responseBody);
    }

    // ── Rate limit 429 → ProblemDetails ──

    [Fact]
    public async Task RateLimit_429_ReturnsProblemJsonContentType()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var invalidBody = new StringContent(
            """{"model":"","messages":[]}""",
            Encoding.UTF8, "application/json");

        // Exhaust the 10-token bucket
        for (var i = 0; i < 10; i++)
        {
            using var resp = await client.PostAsync("/api/chat/stream", invalidBody);
        }

        // 11th → 429
        var throttled = await client.PostAsync("/api/chat/stream", invalidBody);

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.NotNull(throttled.Content.Headers.ContentType);
        Assert.Equal("application/problem+json",
            throttled.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task RateLimit_429_BodyContainsProblemDetailsFields()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var invalidBody = new StringContent(
            """{"model":"","messages":[]}""",
            Encoding.UTF8, "application/json");

        for (var i = 0; i < 10; i++)
        {
            using var resp = await client.PostAsync("/api/chat/stream", invalidBody);
        }

        var throttled = await client.PostAsync("/api/chat/stream", invalidBody);
        var body = await throttled.Content.ReadAsStringAsync();

        Assert.Contains("\"title\"", body);
        Assert.Contains("\"status\":429", body);
        Assert.Contains("\"detail\"", body);
        Assert.Contains("\"traceId\"", body);
    }
}
