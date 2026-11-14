using Microsoft.AspNetCore.Mvc;
using System.Text;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Read-only view over the curated promo/event list. The list is maintained by an
/// agent cron and imported via the seeder. Routes are NOT guest-exempt, so
/// anonymous callers get 401 — events are private.
/// </summary>
[ApiController]
[Route("api/events")]
[Tags("Events")]
public sealed class EventsController(IPromoEventRepository repository) : ControllerBase
{
    /// <summary>All curated events (newest first), optionally filtered by platform.</summary>
    /// <param name="aplikasi">Optional platform filter (GoPay, OVO, DANA, …).</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Curated event list.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> List(
        [FromQuery] string? aplikasi,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.ListAsync(aplikasi, cancellationToken);
        return Ok(items);
    }

    /// <summary>Exports the curated event list as CSV (RFC 4180, UTF-8 with BOM).</summary>
    /// <param name="aplikasi">Optional platform filter; omitted exports every platform.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">CSV file download.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Export(
        [FromQuery] string? aplikasi,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.ListAsync(aplikasi, cancellationToken);

        var sb = new StringBuilder();
        sb.AppendLine("aplikasi,judul,benefit,syarat,berlakuSampai,ditemukan,link,sourceId");
        foreach (var e in items)
        {
            sb.Append(Csv(e.Aplikasi)).Append(',');
            sb.Append(Csv(e.Judul)).Append(',');
            sb.Append(Csv(e.Benefit ?? string.Empty)).Append(',');
            sb.Append(Csv(e.Syarat ?? string.Empty)).Append(',');
            sb.Append(Csv(e.BerlakuSampai ?? string.Empty)).Append(',');
            sb.Append(e.Ditemukan.ToString("yyyy-MM-dd")).Append(',');
            sb.Append(Csv(e.Link ?? string.Empty)).Append(',');
            sb.Append(Csv(e.SourceId ?? string.Empty)).Append('\n');
        }

        // UTF-8 BOM so Excel renders the CSV as UTF-8 rather than ANSI.
        var bytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(sb.ToString()))
            .ToArray();

        return File(bytes, "text/csv; charset=utf-8", $"events-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    /// <summary>Quotes a CSV field per RFC 4180 when it contains a delimiter, quote, or newline.</summary>
    private static string Csv(string value)
    {
        if (value.Contains('"') || value.Contains(',') || value.Contains('\n') || value.Contains('\r'))
        {
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
