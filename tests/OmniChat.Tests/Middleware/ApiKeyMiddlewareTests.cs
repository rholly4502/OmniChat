using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
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

    private static IHostEnvironment Env(string name) => new TestHostEnvironment { EnvironmentName = name };

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "OmniChat";
        public string ContentRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; }
            = new Microsoft.Extensions.FileProviders.NullFileProvider();
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
    [Fact]
    public async Task InvokeAsync_NoKeyConfigured_Development_PassesThroughAsOperator()
    {
        // Outside Production a missing API key still treats every caller as the operator
        // (local development / the test suite). The item flag must be set so ChatIdentity
        // resolves the caller as Admin.
        var ctx = Context("/api/conversations");
        var mw = new ApiKeyMiddleware(_ => Task.CompletedTask,
            NullLogger<ApiKeyMiddleware>.Instance, Config(null), Env("Development"));

        await mw.InvokeAsync(ctx);

        Assert.Equal(200, ctx.Response.StatusCode);
        Assert.Equal(true, ctx.Items[ApiKeyMiddleware.ApiKeyAuthenticatedItemKey]);
    }

    [Fact]
    public async Task InvokeAsync_NoKeyConfigured_Production_ProtectedRoute_Returns401()
    {
        // Fail-closed: with no API key configured in Production the API must NOT silently
        // open. A protected route (history) is rejected even though no key is set.
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config(null), Env("Production"));
        var ctx = Context("/api/conversations");

        await mw.InvokeAsync(ctx);

        Assert.False(nextCalled);
        Assert.Equal(401, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_NoKeyConfigured_Production_GuestPath_AllowsAnonymous()
    {
        // Guests must still be able to chat anonymously in Production via the guest stream.
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config(null), Env("Production"));

        await mw.InvokeAsync(Context("/api/chat/stream"));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_NoKeyConfigured_Production_HealthPath_Allows()
    {
        // Health stays public even when fail-closed.
        var nextCalled = false;
        var mw = new ApiKeyMiddleware(_ => { nextCalled = true; return Task.CompletedTask; },
            NullLogger<ApiKeyMiddleware>.Instance, Config(null), Env("Production"));

        await mw.InvokeAsync(Context("/health"));

        Assert.True(nextCalled);
    }
}
