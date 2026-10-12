using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies that the OpenAPI document served at /openapi/v1.json (Development only)
/// carries the enriched metadata from <see cref="OmniChat.Api.Infrastructure.OpenApi.OpenApiDocumentTransformer"/>.
/// </summary>
public class OpenApiMetadataIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public OpenApiMetadataIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private static async Task<JsonDocument> GetOpenApiDocumentAsync(HttpClient client)
    {
        var response = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.StartsWith("application/json", response.Content.Headers.ContentType!.MediaType);

        await using var stream = await response.Content.ReadAsStreamAsync();
        return await JsonDocument.ParseAsync(stream);
    }

    [Fact]
    public async Task OpenApiDocument_HasExpectedTitle()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var title = doc.RootElement.GetProperty("info").GetProperty("title").GetString();
        Assert.Equal("OmniChat API", title);
    }

    [Fact]
    public async Task OpenApiDocument_HasExpectedVersion()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var version = doc.RootElement.GetProperty("info").GetProperty("version").GetString();
        Assert.Equal("v1", version);
    }

    [Fact]
    public async Task OpenApiDocument_HasDescription()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var description = doc.RootElement.GetProperty("info").GetProperty("description").GetString();
        Assert.NotNull(description);
        Assert.NotEmpty(description);
        Assert.Contains("SSE", description);
        Assert.Contains("Hermes", description);
    }

    [Fact]
    public async Task OpenApiDocument_HasContact()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var contact = doc.RootElement.GetProperty("info").GetProperty("contact");
        Assert.Equal("Rholly", contact.GetProperty("name").GetString());
        Assert.Contains("github.com", contact.GetProperty("url").GetString());
    }

    [Fact]
    public async Task OpenApiDocument_HasMitLicense()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var license = doc.RootElement.GetProperty("info").GetProperty("license");
        Assert.Equal("MIT", license.GetProperty("name").GetString());
        Assert.Contains("opensource.org", license.GetProperty("url").GetString());
    }

    [Fact]
    public async Task OpenApiDocument_HasChatPaths()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var paths = doc.RootElement.GetProperty("paths");
        // The models endpoint
        Assert.True(paths.TryGetProperty("/api/models", out _), "Expected /api/models path in OpenAPI document");
        // The chat stream endpoint
        Assert.True(paths.TryGetProperty("/api/Chat/stream", out _), "Expected /api/Chat/stream path in OpenAPI document");
    }

    [Fact]
    public async Task OpenApiDocument_ChatStreamHasExpectedStatusCodes()
    {
        using var doc = await GetOpenApiDocumentAsync(_factory.CreateClient());
        var streamOp = doc.RootElement
            .GetProperty("paths").GetProperty("/api/Chat/stream")
            .GetProperty("post");

        var responses = streamOp.GetProperty("responses");
        // 200 (SSE stream), 400 (validation), 401 (auth), 429 (rate limit)
        Assert.True(responses.TryGetProperty("200", out _), "Expected 200 response in chat stream");
        Assert.True(responses.TryGetProperty("400", out _), "Expected 400 response in chat stream");
        Assert.True(responses.TryGetProperty("401", out _), "Expected 401 response in chat stream");
        Assert.True(responses.TryGetProperty("429", out _), "Expected 429 response in chat stream");
    }
}
