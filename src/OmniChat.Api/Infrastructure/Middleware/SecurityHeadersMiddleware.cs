namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Adds standard HTTP security response headers to every response.
/// Headers are set as defaults — downstream code that explicitly sets the
/// same header before the response starts will take precedence.
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        // Stop the browser from MIME-sniffing a response away from the declared content type.
        headers["X-Content-Type-Options"] = "nosniff";
        // The API returns JSON only — never allow it to be framed.
        headers["X-Frame-Options"] = "DENY";
        // Don't leak the full URL (which may contain ids) to third parties.
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        // Legacy Adobe cross-domain policy: block policy files from being honoured.
        headers["X-Permitted-Cross-Domain-Policies"] = "none";
        // Force HTTPS for a year once the client has seen the site over TLS.
        // Browsers ignore this on plain-HTTP responses, so it is safe to always send.
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
        // The API needs none of these browser capabilities.
        headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";

        await _next(context);
    }
}
