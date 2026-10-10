using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class JwtAuthenticationMiddlewareTests
{
    private const string Key = "test-signing-key-that-is-long-enough-1234567890";

    private static IConfiguration Config(string? apiKey = null)
    {
        var dict = new Dictionary<string, string?>();
        if (apiKey is not null) dict["Security:ApiKey"] = apiKey;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static JwtTokenValidator Validator(bool enabled)
    {
        var options = new JwtOptions { SigningKey = enabled ? Key : null, Issuer = "OmniChat", Audience = "OmniChat" };
        return new JwtTokenValidator(options);
    }

    private static string ValidToken()
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "OmniChat", audience: "OmniChat",
            claims: [new Claim(JwtRegisteredClaimNames.Sub, "tester")],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static DefaultHttpContext Context(string path, string? authorization = null)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = path;
        ctx.Response.Body = new MemoryStream();
        if (authorization is not null) ctx.Request.Headers.Authorization = authorization;
        return ctx;
    }

    private static JwtAuthenticationMiddleware Middleware(
        Action onNext, bool enabled, string? apiKey = null) =>
        new(_ => { onNext(); return Task.CompletedTask; },
            NullLogger<JwtAuthenticationMiddleware>.Instance, Validator(enabled), Config(apiKey));

    [Fact]
    public async Task Disabled_PassesThrough()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: false);
        await mw.InvokeAsync(Context("/api/chat/stream"));
        Assert.True(called);
    }

    [Fact]
    public async Task Enabled_ExemptPath_PassesThroughWithoutToken()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: true);
        await mw.InvokeAsync(Context("/health"));
        Assert.True(called);
    }

    [Fact]
    public async Task Enabled_ValidBearer_PassesAndMarksAuthenticated()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: true);
        var ctx = Context("/api/chat/stream", $"Bearer {ValidToken()}");

        await mw.InvokeAsync(ctx);

        Assert.True(called);
        Assert.True(JwtAuthenticationMiddleware.IsAuthenticated(ctx));
    }

    [Fact]
    public async Task Enabled_InvalidBearer_Returns401()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: true);
        var ctx = Context("/api/chat/stream", "Bearer not-a-valid-token");

        await mw.InvokeAsync(ctx);

        Assert.False(called);
        Assert.Equal(401, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task Enabled_NoToken_NoApiKey_Returns401()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: true);
        var ctx = Context("/api/chat/stream");

        await mw.InvokeAsync(ctx);

        Assert.False(called);
        Assert.Equal(401, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task Enabled_NoToken_ApiKeyConfigured_DefersToApiKeyMiddleware()
    {
        var called = false;
        var mw = Middleware(() => called = true, enabled: true, apiKey: "secret-key");
        await mw.InvokeAsync(Context("/api/chat/stream"));
        Assert.True(called);
    }

    [Fact]
    public async Task Enabled_InvalidBearer_WritesJsonError()
    {
        var mw = Middleware(() => { }, enabled: true);
        var ctx = Context("/api/chat/stream", "Bearer garbage");

        await mw.InvokeAsync(ctx);

        ctx.Response.Body.Position = 0;
        using var reader = new StreamReader(ctx.Response.Body);
        var body = await reader.ReadToEndAsync();
        Assert.Contains("bearer token", body, StringComparison.OrdinalIgnoreCase);
    }
}
