using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace OmniChat.Api.Infrastructure.Health;

/// <summary>
/// Writes the health-check response as a small JSON document instead of the default plain-text
/// status, so uptime tooling and dashboards can read structured data. Status-code semantics are
/// untouched (200 while healthy).
/// </summary>
public static class HealthResponseWriter
{
    public static async Task WriteAsync(HttpContext context, HealthReport report)
    {
        var startTime = context.RequestServices.GetService<ServiceStartTime>();

        var payload = new
        {
            status = report.Status.ToString(),
            version = typeof(HealthResponseWriter).Assembly.GetName().Version?.ToString() ?? "unknown",
            uptimeSeconds = startTime is null ? 0 : (long)startTime.Uptime.TotalSeconds,
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString()
            })
        };

        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(payload);
    }
}
