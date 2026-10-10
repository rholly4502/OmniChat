using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies the correlation-id middleware runs in the real pipeline and
/// the X-Correlation-Id header reaches the client.
/// </summary>
public class CorrelationIdIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public CorrelationIdIntegrationTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Response_ContainsCorrelationIdHeader()
    {
        var response = await _client.GetAsync("/health");
        Assert.True(response.Headers.Contains("X-Correlation-Id"));
        var id = response.Headers.GetValues("X-Correlation-Id").Single();
        Assert.False(string.IsNullOrWhiteSpace(id));
    }

    [Fact]
    public async Task ProvidedCorrelationId_IsEchoed()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("X-Correlation-Id", "client-trace-42");
        var response = await _client.SendAsync(request);
        Assert.Equal("client-trace-42", response.Headers.GetValues("X-Correlation-Id").Single());
    }
}
