namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Global exception handling middleware that catches unhandled exceptions
/// and returns a structured JSON error response instead of leaking stack traces.
/// </summary>
public sealed class ExceptionHandlingMiddleware
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
            // Client disconnected — not an error, just log at debug level.
            _logger.LogDebug("Request was cancelled by the client.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception occurred on {Method} {Path}",
                context.Request.Method, context.Request.Path);

            // If the response has already started (e.g. an SSE stream), the status code and
            // headers are on the wire and cannot be rewritten — attempting to do so throws.
            // Nothing further can be reported to the client in that case.
            if (context.Response.HasStarted)
            {
                _logger.LogWarning(
                    "Response already started for {Method} {Path}; cannot emit a ProblemDetails body.",
                    context.Request.Method, context.Request.Path);
                return;
            }

            await ProblemDetailsResponse.WriteAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "Internal Server Error",
                "An unexpected error occurred.",
                context.RequestAborted);
        }
    }
}
