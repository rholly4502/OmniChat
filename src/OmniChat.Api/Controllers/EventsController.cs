using Microsoft.AspNetCore.Mvc;
using System.Text;
using OmniChat.Api.Infrastructure;
using OmniChat.Infrastructure.Services;
using OmniChat.Domain.Models;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Curated promo/event list: read-only view plus operator CRUD for manual curation.
/// Routes are NOT guest-exempt, so anonymous callers get 401 — events are private.
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
    /// <summary>Digest of the curated promo list for the Ringkasan card.</summary>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Event digest (totals + expiry buckets).</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("summary")]
    [ProducesResponseType(typeof(EventsSummary), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Summary(CancellationToken cancellationToken = default)
    {
        return Ok(await repository.EventsSummaryAsync(TodayWib(), cancellationToken));
    }

    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Export(
        [FromQuery] string? aplikasi,
        [FromQuery] string? q = null,
        [FromQuery] bool? hideExpired = null,
        [FromQuery] string? format = null,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.ListAsync(aplikasi, cancellationToken);

        // Mirror the on-screen filters so an export yields exactly what the user
        // is looking at: keyword match over judul/aplikasi/benefit/syarat, and
        // (when "Sembunyikan kedaluwarsa" is on) dropping expired promos. A promo
        // counts as expired only when its end date parses as YYYY-MM-DD and is in
        // the past — rows with no end date or free-text dates stay (frontend
        // treats those as active, not expired).
        var today = TodayWib();
        var keyword = string.IsNullOrWhiteSpace(q) ? null : q!.Trim().ToLowerInvariant();
        var filtered = items.Where(e =>
            (keyword == null ||
             e.Judul.ToLowerInvariant().Contains(keyword) ||
             e.Aplikasi.ToLowerInvariant().Contains(keyword) ||
             (e.Benefit ?? string.Empty).ToLowerInvariant().Contains(keyword) ||
             (e.Syarat ?? string.Empty).ToLowerInvariant().Contains(keyword)) &&
            (!(hideExpired ?? false) || !IsExpired(e, today))).ToList();

        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdf = EventsPdfReport.Build(filtered, today);
            return File(pdf, "application/pdf", $"events-{DateTime.UtcNow:yyyy-MM-dd}.pdf");
        }

        var sb = new StringBuilder();
        sb.AppendLine("aplikasi,judul,benefit,syarat,berlakuSampai,ditemukan,link,sourceId");
        foreach (var e in filtered)
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

    /// <summary>Creates a manually curated promo event from the web UI (operator only).</summary>
    /// <param name="request">The new event fields.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="201">The created event.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Create([FromBody] EventWriteRequest request, CancellationToken cancellationToken)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var @event = new PromoEvent
        {
            Aplikasi = request.Aplikasi.Trim(),
            Judul = request.Judul.Trim(),
            Benefit = TrimOrNull(request.Benefit),
            Syarat = TrimOrNull(request.Syarat),
            Link = TrimOrNull(request.Link),
            BerlakuSampai = TrimOrNull(request.BerlakuSampai),
            Ditemukan = DateOnly.ParseExact(request.Ditemukan, "yyyy-MM-dd"),
            // Manual rows get a distinct SourceId prefix so the seeder's dedup can
            // never mistake them for an auto-imported (platform|judul) row.
            SourceId = "web-" + Guid.NewGuid().ToString("N")[..8],
        };

        var created = await repository.AddAsync(@event, cancellationToken);
        return CreatedAtAction(nameof(List), new { }, created);
    }

    /// <summary>Updates a manually curated promo event (operator only).</summary>
    /// <param name="id">The event id to update.</param>
    /// <param name="request">The replacement event fields.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">The updated event.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No such event.</response>
    [HttpPut("{id:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(long id, [FromBody] EventWriteRequest request, CancellationToken cancellationToken)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var @event = new PromoEvent
        {
            Id = id,
            Aplikasi = request.Aplikasi.Trim(),
            Judul = request.Judul.Trim(),
            Benefit = TrimOrNull(request.Benefit),
            Syarat = TrimOrNull(request.Syarat),
            Link = TrimOrNull(request.Link),
            BerlakuSampai = TrimOrNull(request.BerlakuSampai),
            Ditemukan = DateOnly.ParseExact(request.Ditemukan, "yyyy-MM-dd"),
        };

        var ok = await repository.UpdateAsync(@event, cancellationToken);
        if (!ok)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"No event with id {id} exists.",
                Instance = HttpContext?.Request.Path,
            });
        }

        var updated = await repository.GetByIdAsync(id, cancellationToken);
        return Ok(updated!);
    }

    /// <summary>Deletes a promo event (operator only).</summary>
    /// <param name="id">The event id to delete.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Deleted.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No such event.</response>
    [HttpDelete("{id:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(long id, CancellationToken cancellationToken)
    {
        var ok = await repository.DeleteAsync(id, cancellationToken);
        if (!ok)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"No event with id {id} exists.",
                Instance = HttpContext?.Request.Path,
            });
        }

        return NoContent();
    }

    /// <summary>Validates a write request, returning a 400 ProblemDetails or null when valid.</summary>
    /// <summary>Today in WIB (UTC+7) — the timezone the promo expiry buckets use.</summary>
    private static DateOnly TodayWib() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));

    private ObjectResult? Validate(EventWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Aplikasi))
        {
            return BadRequest("'aplikasi' wajib diisi.");
        }

        if (string.IsNullOrWhiteSpace(request.Judul))
        {
            return BadRequest("'judul' wajib diisi.");
        }

        if (!DateOnly.TryParseExact(request.Ditemukan, "yyyy-MM-dd", out _))
        {
            return BadRequest("'ditemukan' must be a valid YYYY-MM-DD date.");
        }

        return null;
    }

    private ObjectResult BadRequest(string detail) =>
        new(new ProblemDetails
        {
            Title = "Validation Failed",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
            Instance = HttpContext?.Request.Path,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { ProblemDetailsResponse.ContentType },
        };

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Request body for creating or updating a promo event.</summary>
    public sealed record EventWriteRequest(
        string Aplikasi,
        string Judul,
        string? Benefit,
        string? Syarat,
        string? Link,
        string? BerlakuSampai,
        string Ditemukan);

    /// <summary>True when a promo's end date parsed as YYYY-MM-DD is before `today`.</summary>
    private static bool IsExpired(PromoEvent e, DateOnly today)
    {
        return e.BerlakuSampai is string s
            && DateOnly.TryParseExact(s.Trim(), "yyyy-MM-dd", out var end)
            && end < today;
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
