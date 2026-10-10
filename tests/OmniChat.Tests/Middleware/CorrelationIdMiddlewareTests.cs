using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class CorrelationIdMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_NoHeader_GeneratesAndEchoesCorrelationId()
    {
        var mw = new CorrelationIdMiddleware(_ => Task.CompletedTask, NullLogger<CorrelationIdMiddleware>.Instance);
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.True(ctx.Response.Headers.ContainsKey(CorrelationIdMiddleware.HeaderName));
        Assert.False(string.IsNullOrWhiteSpace(ctx.Response.Headers[CorrelationIdMiddleware.HeaderName]));
    }

    [Fact]
    public async Task InvokeAsync_ExistingHeader_PreservesIt()
    {
        var mw = new CorrelationIdMiddleware(_ => Task.CompletedTask, NullLogger<CorrelationIdMiddleware>.Instance);
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers[CorrelationIdMiddleware.HeaderName] = "abc-123";

        await mw.InvokeAsync(ctx);

        Assert.Equal("abc-123", ctx.Response.Headers[CorrelationIdMiddleware.HeaderName].ToString());
    }

    [Fact]
    public async Task InvokeAsync_SetsTraceIdentifierForLogCorrelation()
    {
        var mw = new CorrelationIdMiddleware(_ => Task.CompletedTask, NullLogger<CorrelationIdMiddleware>.Instance);
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers[CorrelationIdMiddleware.HeaderName] = "trace-me";

        await mw.InvokeAsync(ctx);

        Assert.Equal("trace-me", ctx.TraceIdentifier);
    }

    [Fact]
    public async Task InvokeAsync_BlankHeader_GeneratesNewId()
    {
        var mw = new CorrelationIdMiddleware(_ => Task.CompletedTask, NullLogger<CorrelationIdMiddleware>.Instance);
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers[CorrelationIdMiddleware.HeaderName] = "   ";

        await mw.InvokeAsync(ctx);

        Assert.NotEqual("   ", ctx.Response.Headers[CorrelationIdMiddleware.HeaderName].ToString());
    }
}
