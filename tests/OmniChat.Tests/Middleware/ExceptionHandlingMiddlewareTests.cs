using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class ExceptionHandlingMiddlewareTests
{
    private static DefaultHttpContext Context()
    {
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        ctx.TraceIdentifier = "test-trace-id";
        return ctx;
    }

    private static ExceptionHandlingMiddleware CreateMiddleware(RequestDelegate next) =>
        new(next, NullLogger<ExceptionHandlingMiddleware>.Instance);

    [Fact]
    public async Task InvokeAsync_NoException_CallsNext()
    {
        var nextCalled = false;
        var mw = CreateMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });

        await mw.InvokeAsync(Context());

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_OperationCanceledException_DoesNotSetErrorStatus()
    {
        var mw = CreateMiddleware(_ => throw new OperationCanceledException());
        var ctx = Context();

        await mw.InvokeAsync(ctx);

        // Client disconnect is not an error — status remains 200 (default)
        Assert.Equal(200, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_GeneralException_Returns500()
    {
        var mw = CreateMiddleware(_ => throw new InvalidOperationException("boom"));
        var ctx = Context();

        await mw.InvokeAsync(ctx);

        Assert.Equal(500, ctx.Response.StatusCode);
    }

    [Fact]
    public async Task InvokeAsync_GeneralException_SetsJsonContentType()
    {
        var mw = CreateMiddleware(_ => throw new InvalidOperationException("boom"));
        var ctx = Context();

        await mw.InvokeAsync(ctx);

        Assert.Equal("application/json", ctx.Response.ContentType);
    }

    [Fact]
    public async Task InvokeAsync_GeneralException_ReturnsJsonWithErrorAndTraceId()
    {
        var mw = CreateMiddleware(_ => throw new InvalidOperationException("boom"));
        var ctx = Context();

        await mw.InvokeAsync(ctx);

        ctx.Response.Body.Position = 0;
        using var reader = new StreamReader(ctx.Response.Body);
        var body = await reader.ReadToEndAsync();

        Assert.Contains("unexpected error", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("test-trace-id", body);
    }
}
