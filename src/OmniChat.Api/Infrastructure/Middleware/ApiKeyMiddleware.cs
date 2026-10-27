using OmniChat.Api.Infrastructure.Auth;
using System.Security.Cryptography;
using System.Text;

namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Requires a valid <c>X-Api-Key</c> header on protected routes when <c>Security:ApiKey</c>
/// is configured. Comparison is constant-time to avoid leaking the key through timing.
/// When no key is configured the middleware is a pass-through, so local development and
/// the test suite run without credentials.
/// </summary>
public sealed class ApiKeyMiddleware
{
    public const string HeaderName = "X-Api-Key";

    private readonly RequestDelegate _next;
    private readonly ILogger<ApiKeyMiddleware> _logger;
    private readonly string? _configuredApiKey;

    public ApiKeyMiddleware(RequestDelegate next, ILogger<ApiKeyMiddleware> logger, IConfiguration configuration)
    {
        _next = next;
        _logger = logger;
        _configuredApiKey = configuration["Security:ApiKey"];
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // A valid JWT (see JwtAuthenticationMiddleware) already authenticated this request.
        if (JwtAuthenticationMiddleware.IsAuthenticated(context))
        {
            await _next(context);
            return;
        }

        // CORS preflight (OPTIONS) must pass without an API key, otherwise the browser
        // blocks the real request before it is ever sent.
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        if (string.IsNullOrEmpty(_configuredApiKey) || AuthExemptPaths.IsExempt(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var provided = context.Request.Headers.TryGetValue(HeaderName, out var header)
            ? header.ToString()
            : null;

        if (provided is null || !FixedTimeEquals(provided, _configuredApiKey))
        {
            _logger.LogWarning("Rejected {Method} {Path}: missing or invalid API key.",
                context.Request.Method, context.Request.Path);

            await ProblemDetailsResponse.WriteUnauthorizedAsync(
                context, "Missing or invalid API key.", context.RequestAborted);
            return;
        }

        await _next(context);
    }

    private static bool FixedTimeEquals(string provided, string expected)
    {
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        // FixedTimeEquals requires equal length; the length check itself leaks only the length.
        return providedBytes.Length == expectedBytes.Length &&
               CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes);
    }
}
