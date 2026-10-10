using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using OmniChat.Api.Infrastructure.Health;

namespace OmniChat.Tests.Health;

public class HealthResponseWriterTests
{
    private static HttpContext CreateContext()
    {
        var services = new ServiceCollection();
        services.AddSingleton(new ServiceStartTime());
        var ctx = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        ctx.Response.Body = new MemoryStream();
        return ctx;
    }

    private static HealthReport Report(HealthStatus status) =>
        new(new Dictionary<string, HealthReportEntry>(), status, TimeSpan.FromMilliseconds(1));

    [Fact]
    public async Task WriteAsync_WritesJsonWithStatusVersionAndUptime()
    {
        var ctx = CreateContext();

        await HealthResponseWriter.WriteAsync(ctx, Report(HealthStatus.Healthy));

        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        using var doc = await JsonDocument.ParseAsync(ctx.Response.Body);
        var root = doc.RootElement;
        Assert.Equal("Healthy", root.GetProperty("status").GetString());
        Assert.True(root.GetProperty("uptimeSeconds").GetInt64() >= 0);
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("version").GetString()));
    }

    [Fact]
    public async Task WriteAsync_SetsJsonContentType()
    {
        var ctx = CreateContext();

        await HealthResponseWriter.WriteAsync(ctx, Report(HealthStatus.Healthy));

        Assert.NotNull(ctx.Response.ContentType);
        Assert.StartsWith("application/json", ctx.Response.ContentType);
    }

    [Fact]
    public async Task WriteAsync_IncludesCheckEntries()
    {
        var ctx = CreateContext();
        var entries = new Dictionary<string, HealthReportEntry>
        {
            ["self"] = new(HealthStatus.Healthy, "ok", TimeSpan.Zero, null, null)
        };
        var report = new HealthReport(entries, HealthStatus.Healthy, TimeSpan.FromMilliseconds(2));

        await HealthResponseWriter.WriteAsync(ctx, report);

        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        using var doc = await JsonDocument.ParseAsync(ctx.Response.Body);
        var checks = doc.RootElement.GetProperty("checks");
        Assert.Equal(1, checks.GetArrayLength());
        Assert.Equal("self", checks[0].GetProperty("name").GetString());
        Assert.Equal("Healthy", checks[0].GetProperty("status").GetString());
    }
}
