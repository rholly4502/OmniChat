using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class ApiKeyMiddlewareTests
{
    private static IConfiguration Config(string? apiKey)
    {
        var dict = new Dictionary<string, string?>();
        if (apiKey is not null) dict["Security:ApiKey"] = apiKey;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static DefaultHttpContext Context(string path, string? headerValue = null)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = path;
        ctx.Response.Body = new MemoryStream();
        if (headerValue is not null) ctx.Request.Headers[ApiKeyMiddleware.HeaderName] = headerValue;
        return ctx;
    }

    [Fact]
    public async Task InvokeAsync_NoKeyConfigured_PassesThrough()
    {
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config(null));

        await mw.InvokeAsync(Context("/api/chat/stream"));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_KeyConfigured_MissingHeader_Returns401()
    {
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));
        var ctx = Context("/api/conversations");

        await mw.InvokeAsync(ctx);

        Assert.False(nextCalled);
        Assert.Equal(401, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_KeyConfigured_WrongKey_Returns401()
    {
        var mw = new ApiKeyMiddleware(_ => Task.CompletedTask,
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));
        var ctx = Context("/api/conversations", "wrong");

        await mw.InvokeAsync(ctx);

        Assert.Equal(401, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_KeyConfigured_CorrectKey_PassesThrough()
    {
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));

        await mw.InvokeAsync(Context("/api/chat/stream", "secret-key"));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_HealthPath_ExemptEvenWithKeyConfigured()
    {
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));

        await mw.InvokeAsync(Context("/health"));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_Unauthorized_WritesProblemDetails()
    {
        var mw = new ApiKeyMiddleware(_ => Task.CompletedTask,
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));
        var ctx = Context("/api/conversations");

        await mw.InvokeAsync(ctx);

        Assert.Equal("application/problem+json", ctx.Response.ContentType);
        ctx.Response.Body.Position = 0;
        using var reader = new StreamReader(ctx.Response.Body);
        var body = await reader.ReadToEndAsync();
        // ProblemDetails (RFC 7807) structure
        Assert.Contains("\"title\"", body);
        Assert.Contains("\"status\":401", body);
        Assert.Contains("\"detail\"", body);
        Assert.Contains("api key", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"traceId\"", body);
    }

    [Fact]
    public async Task InvokeAsync_KeyConfigured_GuestPathAllowsAnonymous()
    {
        // /api/chat/stream is the one route reachable without a key: it is the guest entry point.
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config("secret-key"));

        await mw.InvokeAsync(Context("/api/chat/stream"));

        Assert.True(nextCalled);
        Assert.Equal(200, Context("/api/chat/stream").Response.StatusCode);
    }
}
