using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies that security headers are present on responses from multiple
/// endpoints, ensuring the <see cref="OmniChat.Api.Infrastructure.Middleware.SecurityHeadersMiddleware"/>
/// is wired into the pipeline and covers the full HTTP surface.
/// </summary>
public class SecurityHeadersIntegrationTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory = new();

    [Fact]
    public async Task HealthEndpoint_ReturnsSecurityHeaders()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").First());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").First());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").First());
    }

    [Fact]
    public async Task ModelsEndpoint_ReturnsSecurityHeaders()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/models");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").First());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").First());
    }

    [Fact]
    public async Task NotFound_ReturnsSecurityHeaders()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/nonexistent");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").First());
    }

    public void Dispose() => _factory.Dispose();
}
