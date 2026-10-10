using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies the CORS policy is driven by configuration (Cors:AllowedOrigins)
/// instead of blindly allowing every origin.
/// </summary>
public class CorsIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string AllowedOrigin = "http://localhost:5173";
    private readonly WebApplicationFactory<Program> _factory;

    public CorsIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

    private HttpClient ClientWithAllowedOrigin()
        => _factory.WithWebHostBuilder(b =>
              b.UseSetting("Cors:AllowedOrigins:0", AllowedOrigin))
          .CreateClient();

    private static HttpRequestMessage GetWithOrigin(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", origin);
        return request;
    }

    [Fact]
    public async Task AllowedOrigin_ReceivesMatchingAllowOriginHeader()
    {
        var response = await ClientWithAllowedOrigin().SendAsync(GetWithOrigin(AllowedOrigin));

        Assert.True(response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.Equal(AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task DisallowedOrigin_DoesNotReceiveAllowOriginHeader()
    {
        var response = await ClientWithAllowedOrigin().SendAsync(GetWithOrigin("http://evil.example"));

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
