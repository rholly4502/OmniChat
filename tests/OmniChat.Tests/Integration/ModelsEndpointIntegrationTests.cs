using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

public class ModelsEndpointIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ModelsEndpointIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetModels_ReturnsCatalogWithAgentAndDirect()
    {
        var response = await _client.GetAsync("/api/models");

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
}
