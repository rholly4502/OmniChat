namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Adds standard HTTP security response headers to every response.
/// Headers are set as defaults — downstream code that explicitly sets the
/// same header before the response starts will take precedence.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["X-Permitted-Cross-Domain-Policies"] = "none";

        await _next(context);
    }
}
