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
/// <remarks>
/// Guest-accessible routes (<see cref="GuestExemptPaths"/>) are allowed through without a
/// key; they resolve to <see cref="ChatAccess.Guest"/> downstream. Every other route still
/// requires a valid key. A valid key marks the request as API-key-authenticated so
/// <see cref="ChatIdentity"/> can tell an operator from an anonymous guest.
/// </remarks>
public sealed class ApiKeyMiddleware
{
    public const string HeaderName = "X-Api-Key";

    /// <summary>HttpContext item set when a request was authenticated by a valid API key, or when API-key auth is disabled entirely (dev mode).</summary>
    public const string ApiKeyAuthenticatedItemKey = "OmniChat.ApiKeyAuthenticated";

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

        // No API key configured (dev/local mode) or an exempt path: pass through and treat
        // the caller as an operator, preserving pre-guest behaviour.
        if (string.IsNullOrEmpty(_configuredApiKey) || AuthExemptPaths.IsExempt(context.Request.Path))
        {
            context.Items[ApiKeyAuthenticatedItemKey] = true;
            await _next(context);
            return;
        }

        var provided = context.Request.Headers.TryGetValue(HeaderName, out var header)
            ? header.ToString()
            : null;

        if (provided is not null && FixedTimeEquals(provided, _configuredApiKey))
        {
            context.Items[ApiKeyAuthenticatedItemKey] = true;
            await _next(context);
            return;
        }

        // No valid key. A guest-accessible route is allowed through anonymously; anything
        // else is protected and gets a 401.
        if (GuestExemptPaths.IsGuestAllowed(context.Request.Path))
        {
            await _next(context);
            return;
        }

        _logger.LogWarning("Rejected {Method} {Path}: missing or invalid API key.",
            context.Request.Method, context.Request.Path);

        await ProblemDetailsResponse.WriteUnauthorizedAsync(
            context, "Missing or invalid API key.", context.RequestAborted);
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
