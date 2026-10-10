using System.Text.Json;

namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Global exception handling middleware that catches unhandled exceptions
/// and returns a structured JSON error response instead of leaking stack traces.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected — not an error, just log at debug level
            _logger.LogDebug("Request was cancelled by the client.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception occurred on {Method} {Path}",
                context.Request.Method, context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var errorResponse = JsonSerializer.Serialize(new
            {
                error = "An unexpected error occurred.",
                traceId = context.TraceIdentifier
            });

            await context.Response.WriteAsync(errorResponse);
        }
    }
}
