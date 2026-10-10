using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Text.Json;

namespace OmniChat.Tests.Integration;

public class ChatEndpointIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public ChatEndpointIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HealthEndpoint_Returns200()
    {
        // Act
        var response = await _client.GetAsync("/health");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ChatStream_InvalidRequest_Returns400()
    {
        // Arrange — empty messages array triggers MinLength validation
        var invalidBody = """{"model":"test","messages":[]}""";
        var content = new StringContent(invalidBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _client.PostAsync("/api/chat/stream", content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ChatStream_EmptyModel_Returns400()
    {
        // Arrange — empty model string triggers Required validation
        var invalidBody = """{"model":"","messages":[{"role":"user","content":"hi"}]}""";
        var content = new StringContent(invalidBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _client.PostAsync("/api/chat/stream", content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ChatStream_ValidRequest_ReturnsSSEContentType()
    {
        // Arrange
        var validBody = """{"model":"test","messages":[{"role":"user","content":"hello"}],"useHermesBridge":true}""";
        var content = new StringContent(validBody, Encoding.UTF8, "application/json");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream") { Content = content };

        // Act — use HttpCompletionOption.ResponseHeadersRead to read SSE stream
        var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        // Assert — SSE endpoint should return 200 with text/event-stream content type
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType.MediaType);
    }

    [Fact]
    public async Task ChatStream_ValidRequest_ReturnsSSEDataEvents()
    {
        // Arrange
        var validBody = """{"model":"test","messages":[{"role":"user","content":"hello"}],"useHermesBridge":true}""";
        var content = new StringContent(validBody, Encoding.UTF8, "application/json");

        // Act — read the full SSE stream
        var response = await _client.PostAsync("/api/chat/stream", content);
        var responseStream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(responseStream);

        var lines = new List<string>();
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            lines.Add(line);
        }

        // Assert — should have SSE data events (fallback simulation mode will produce content)
        Assert.NotEmpty(lines);
        Assert.Contains(lines, l => l.StartsWith("data: "));
        // SSE stream should terminate with [DONE]
        Assert.Contains(lines, l => l.Contains("[DONE]"));
    }
}
