using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using OmniChat.Api.Infrastructure.Auth;

namespace OmniChat.Api.Infrastructure.Middleware;

/// <summary>
/// Validates <c>Authorization: Bearer &lt;jwt&gt;</c> tokens when JWT auth is enabled
/// (<c>Security:Jwt:SigningKey</c> configured). Additive with <see cref="ApiKeyMiddleware"/>:
/// a request may authenticate with either scheme. Disabled (pass-through) otherwise.
/// </summary>
/// <remarks>
/// Resolution rule:
/// <list type="number">
/// <item>Exempt paths (<c>/health</c>, <c>/openapi</c>) always pass.</item>
/// <item>A valid bearer token passes and marks the request authenticated.</item>
/// <item>A present-but-invalid bearer token returns 401 — no silent fallback.</item>
/// <item>No bearer token: defer to <see cref="ApiKeyMiddleware"/> when an API key is configured,
/// otherwise return 401.</item>
/// </list>
/// </remarks>
public sealed class JwtAuthenticationMiddleware
{
    /// <summary>Marker set in <c>HttpContext.Items</c> for an authenticated (valid-JWT) request.</summary>
    public const string AuthenticatedItemKey = "OmniChat.Authenticated";

    private const string BearerPrefix = "Bearer ";

    private readonly RequestDelegate _next;
    private readonly ILogger<JwtAuthenticationMiddleware> _logger;
    private readonly JwtTokenValidator _validator;
    private readonly bool _apiKeyConfigured;

    public JwtAuthenticationMiddleware(
        RequestDelegate next,
        ILogger<JwtAuthenticationMiddleware> logger,
        JwtTokenValidator validator,
        IConfiguration configuration)
    {
        _next = next;
        _logger = logger;
        _validator = validator;
        _apiKeyConfigured = !string.IsNullOrEmpty(configuration["Security:ApiKey"]);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_validator.IsEnabled || IsExempt(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var authorization = context.Request.Headers.Authorization.ToString();

        if (authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var token = authorization[BearerPrefix.Length..].Trim();

            if (_validator.TryValidate(token, out var principal))
            {
                context.Items[AuthenticatedItemKey] = principal;
                await _next(context);
                return;
            }

            _logger.LogWarning("Rejected {Method} {Path}: invalid JWT bearer token.",
                context.Request.Method, context.Request.Path);
            await RejectAsync(context);
            return;
        }

        if (_apiKeyConfigured)
        {
            // No bearer token, but an API key may satisfy ApiKeyMiddleware downstream.
            await _next(context);
            return;
        }

        _logger.LogWarning("Rejected {Method} {Path}: missing bearer token.",
            context.Request.Method, context.Request.Path);
        await RejectAsync(context);
    }

    /// <summary>True when a prior middleware validated a JWT for this request.</summary>
    public static bool IsAuthenticated(HttpContext context) =>
        context.Items.ContainsKey(AuthenticatedItemKey);

    private static bool IsExempt(PathString path) =>
        path.StartsWithSegments("/health") || path.StartsWithSegments("/openapi");

    private static async Task RejectAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.ContentType = "application/problem+json";
        var problem = new ProblemDetails
        {
            Title = "Unauthorized",
            Status = StatusCodes.Status401Unauthorized,
            Detail = "Missing or invalid bearer token.",
            Instance = context.Request.Path.Value,
        };
        problem.Extensions["traceId"] = context.TraceIdentifier;
        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, ProblemDetailsJson.Options));
    }
}
