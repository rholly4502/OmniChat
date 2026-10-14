using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace OmniChat.Api.Infrastructure;

/// <summary>
/// Writes RFC 7807 <see cref="ProblemDetails"/> responses from middleware, where the MVC
/// pipeline (and therefore <c>AddProblemDetails</c>) is not available.
/// Centralises the content type, the JSON options and the <c>traceId</c> extension so every
/// middleware emits an identical error shape.
/// </summary>
public static class ProblemDetailsResponse
{
    /// <summary>RFC 7807 media type used for every error response.</summary>
    public const string ContentType = "application/problem+json";

    /// <summary>Writes a <see cref="ProblemDetails"/> document with the given status/title/detail.</summary>
    public static Task WriteAsync(
        HttpContext context,
        int statusCode,
        string title,
        string detail,
        CancellationToken cancellationToken = default)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = ContentType;

        var problem = new ProblemDetails
        {
            Title = title,
            Status = statusCode,
            Detail = detail,
            Instance = context.Request.Path.Value,
        };
        problem.Extensions["traceId"] = context.TraceIdentifier;

        return context.Response.WriteAsync(
            JsonSerializer.Serialize(problem, ProblemDetailsJson.Options), cancellationToken);
    }

    /// <summary>Writes a 401 with the standard <c>Unauthorized</c> title.</summary>
    public static Task WriteUnauthorizedAsync(
        HttpContext context,
        string detail,
        CancellationToken cancellationToken = default) =>
        WriteAsync(context, StatusCodes.Status401Unauthorized, "Unauthorized", detail, cancellationToken);
}
