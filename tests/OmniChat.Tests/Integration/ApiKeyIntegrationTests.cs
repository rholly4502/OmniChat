using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies the API-key middleware is wired into the real request pipeline.
/// Uses WithWebHostBuilder to inject a Security:ApiKey value at runtime.
/// </summary>
public class ApiKeyIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string TestKey = "integration-secret";
    private readonly WebApplicationFactory<Program> _factory;

    public ApiKeyIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

    private HttpClient SecuredClient(string? keyHeader = null)
    {
        var client = _factory.WithWebHostBuilder(b => b.UseSetting("Security:ApiKey", TestKey)).CreateClient();
        if (keyHeader is not null) client.DefaultRequestHeaders.Add("X-Api-Key", keyHeader);
        return client;
    }

    private static StringContent ChatBody() =>
        new("""{"model":"m","messages":[{"role":"user","content":"hi"}]}""", Encoding.UTF8, "application/json");

    [Fact]
    public async Task Chat_WithoutApiKey_GuestIsAllowed()
    {
        // The chat stream is guest-accessible: an anonymous caller passes the middleware
        // and is resolved as a guest, so it reaches the controller instead of 401.
        var response = await SecuredClient().PostAsync("/api/chat/stream", ChatBody());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Conversations_WithoutApiKey_Returns401()
    {
        // History is not guest-accessible: a guest must not read stored conversations.
        var response = await SecuredClient().GetAsync("/api/conversations");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Chat_WithCorrectApiKey_IsAllowed()
    {
        var client = SecuredClient(TestKey);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream") { Content = ChatBody() };
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Health_WithoutApiKey_IsExempt()
    {
        var response = await SecuredClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
