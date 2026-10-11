using System.Text.Json;

namespace OmniChat.Api.Infrastructure;

/// <summary>
/// Shared JSON serializer options for ProblemDetails responses.
/// Uses web defaults (camelCase) so that ProblemDetails properties match
/// the RFC 7807 convention used by ASP.NET Core.
/// </summary>
public static class ProblemDetailsJson
{
    public static readonly JsonSerializerOptions Options =
        new(JsonSerializerDefaults.Web);
}
