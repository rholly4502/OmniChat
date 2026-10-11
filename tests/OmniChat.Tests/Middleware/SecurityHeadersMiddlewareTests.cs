using Microsoft.AspNetCore.Http;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class SecurityHeadersMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_AddsContentTypeOptionsHeader()
    {
        var mw = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.Equal("nosniff", ctx.Response.Headers["X-Content-Type-Options"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_AddsFrameOptionsHeader()
    {
        var mw = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.Equal("DENY", ctx.Response.Headers["X-Frame-Options"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_AddsReferrerPolicyHeader()
    {
        var mw = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.Equal("strict-origin-when-cross-origin", ctx.Response.Headers["Referrer-Policy"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_AddsPermittedCrossDomainPoliciesHeader()
    {
        var mw = new SecurityHeadersMiddleware(_ => Task.CompletedTask);
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.Equal("none", ctx.Response.Headers["X-Permitted-Cross-Domain-Policies"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_CallsNextPipeline()
    {
        var called = false;
        var mw = new SecurityHeadersMiddleware(_ => { called = true; return Task.CompletedTask; });
        var ctx = new DefaultHttpContext();

        await mw.InvokeAsync(ctx);

        Assert.True(called);
    }
}
