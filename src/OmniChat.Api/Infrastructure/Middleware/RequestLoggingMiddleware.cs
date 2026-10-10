using System.Diagnostics;

namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Emits a single structured access-log line per request carrying the HTTP method, path,
/// response status code, elapsed time in milliseconds and the correlation id. Register it
/// after <see cref="CorrelationIdMiddleware"/> so <see cref="HttpContext.TraceIdentifier"/>
/// is already populated.
/// </summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await _next(context);
        }
        finally
        {
            stopwatch.Stop();
            _logger.LogInformation(
                "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs} ms [CorrelationId={CorrelationId}]",
                context.Request.Method,
                context.Request.Path.Value,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds,
                context.TraceIdentifier);
        }
    }
}
