using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Middleware;

public class RequestLoggingMiddlewareTests
{
    /// <summary>Captures formatted log lines so tests can assert on them without a logging backend.</summary>
    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
    }

    [Fact]
    public async Task InvokeAsync_CallsNext()
    {
        var called = false;
        var logger = new CapturingLogger<RequestLoggingMiddleware>();
        var mw = new RequestLoggingMiddleware(_ => { called = true; return Task.CompletedTask; }, logger);
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = "/health";

        await mw.InvokeAsync(ctx);

        Assert.True(called);
    }

    [Fact]
    public async Task InvokeAsync_LogsMethodPathAndStatus()
    {
        var logger = new CapturingLogger<RequestLoggingMiddleware>();
        var mw = new RequestLoggingMiddleware(ctx =>
        {
            ctx.Response.StatusCode = 418;
            return Task.CompletedTask;
        }, logger);
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "GET";
        ctx.Request.Path = "/api/chat/stream";

        await mw.InvokeAsync(ctx);

        var line = Assert.Single(logger.Messages);
        Assert.Contains("GET", line);
        Assert.Contains("/api/chat/stream", line);
        Assert.Contains("418", line);
    }

    [Fact]
    public async Task InvokeAsync_LogsEvenWhenNextThrows()
    {
        var logger = new CapturingLogger<RequestLoggingMiddleware>();
        var mw = new RequestLoggingMiddleware(_ => throw new InvalidOperationException("boom"), logger);
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = "/boom";

        await Assert.ThrowsAsync<InvalidOperationException>(() => mw.InvokeAsync(ctx));

        Assert.Contains(logger.Messages, l => l.Contains("/boom"));
    }
}
