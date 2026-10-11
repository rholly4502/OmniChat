using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

public class ModelsEndpointIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string TestKey = "models-secret";
    private readonly WebApplicationFactory<Program> _factory;

    public ModelsEndpointIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private HttpClient SecuredClient(string? keyHeader = null)
    {
        var client = _factory.WithWebHostBuilder(b => b.UseSetting("Security:ApiKey", TestKey)).CreateClient();
        if (keyHeader is not null)
            client.DefaultRequestHeaders.Add("X-Api-Key", keyHeader);
        return client;
    }

    [Fact]
    public async Task GetModels_ReturnsCatalogWithAgentAndDirect()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/models");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.StartsWith("application/json", response.Content.Headers.ContentType!.MediaType);

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);

        var agent = doc.RootElement.GetProperty("agent");
        var direct = doc.RootElement.GetProperty("direct");
        Assert.True(agent.GetArrayLength() > 0);
        Assert.True(direct.GetArrayLength() > 0);
        Assert.True(agent[0].TryGetProperty("id", out _));
        Assert.True(agent[0].TryGetProperty("label", out _));
    }

    [Fact]
    public async Task GetModels_WithoutApiKey_Returns401()
    {
        var response = await SecuredClient().GetAsync("/api/models");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetModels_WithCorrectApiKey_Returns200()
    {
        var response = await SecuredClient(TestKey).GetAsync("/api/models");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
