using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Verifies JWT bearer authentication end-to-end through the real pipeline. The signing key is
/// injected via WithWebHostBuilder so no secret lives in the repo.
/// </summary>
public class JwtAuthIntegrationTests : IDisposable
{
    private const string Key = "integration-jwt-signing-key-long-enough-000111222333";
    private const string Issuer = "OmniChat";
    private const string Audience = "OmniChat";

    private readonly WebApplicationFactory<Program> _factory = new();

    public void Dispose() => _factory.Dispose();

    private HttpClient Client()
    {
        var client = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Security:Jwt:SigningKey", Key);
            b.UseSetting("Security:Jwt:Issuer", Issuer);
            b.UseSetting("Security:Jwt:Audience", Audience);
        }).CreateClient();
        return client;
    }

    private static string Token(string key = Key, DateTime? expires = null)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: Issuer, audience: Audience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, "integration-user")],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: expires ?? DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    private static StringContent ChatBody() =>
        new("""{"model":"m","messages":[{"role":"user","content":"hi"}]}""", Encoding.UTF8, "application/json");

    [Fact]
    public async Task Chat_WithoutToken_GuestIsAllowed()
    {
        // The chat stream is guest-accessible: with JWT enabled but no token and no API key,
        // an anonymous caller still reaches the controller as a guest.
        var response = await Client().PostAsync("/api/chat/stream", ChatBody());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Chat_WithValidBearerToken_IsAllowed()
    {
        var client = Client();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream") { Content = ChatBody() };
        request.Headers.Add("Authorization", $"Bearer {Token()}");

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Chat_WithTokenSignedByWrongKey_Returns401()
    {
        var client = Client();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream") { Content = ChatBody() };
        request.Headers.Add("Authorization", $"Bearer {Token(key: "a-completely-different-signing-key-999888777")}");

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CorsPreflight_WithoutToken_IsNotRejected()
    {
        // Regression: when JWT is enabled and no API key is configured, the preflight OPTIONS
        // request carries no Authorization header. Rejecting it with 401 makes the browser
        // block the real request — the client then reports a generic connection failure.
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/chat/stream");
        request.Headers.Add("Origin", "https://example.com");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await Client().SendAsync(request);

        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Health_WithoutToken_IsExempt()
    {
        var response = await Client().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
