using Microsoft.AspNetCore.Mvc;
using System.Text;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Read-only view over the curated job-opportunity list. The list is maintained by an
/// agent cron and imported via the seeder; this API serves what was stored. Routes are
/// NOT guest-exempt, so anonymous callers get 401 — opportunities are private.
/// </summary>
[ApiController]
[Route("api/jobs")]
[Tags("Jobs")]
public sealed class JobsController(
    IOpportunityRepository repository,
    ILamaranDraftService lamaranDraftService) : ControllerBase
{
    /// <summary>All curated opportunities (newest first), optionally filtered by status.</summary>
    /// <param name="status">Optional pipeline filter: new, applied, interview, offer, closed.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Curated opportunity list.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> List(
        [FromQuery] string? status,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.ListAsync(status, cancellationToken);
        return Ok(items);
    }

    /// <summary>Moves one opportunity to another pipeline status (new/applied/interview/offer/closed).</summary>
    /// <param name="id">Opportunity id.</param>
    /// <param name="request">Body containing the target status.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Status updated.</response>
    /// <response code="400">Unknown status value.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No opportunity with this id.</response>
    [HttpPatch("{id}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateStatus(
        long id,
        [FromBody] UpdateOpportunityStatusRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!OpportunityStatuses.Contains(request.Status))
        {
            return BadRequest(new { message = $"Status '{request.Status}' tidak dikenal." });
        }

        var updated = await repository.UpdateStatusAsync(id, request.Status, cancellationToken);
        return updated ? NoContent() : NotFound(new { message = $"Lowongan {id} tidak ditemukan." });
    }

    /// <summary>Sets/clears the follow-up date for one opportunity.</summary>
    /// <param name="id">Opportunity id.</param>
    /// <param name="request">Body carrying an ISO date (YYYY-MM-DD) or null to clear.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Follow-up date updated.</response>
    /// <response code="400">Malformed date.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No opportunity with this id.</response>
    [HttpPatch("{id}/follow-up")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateFollowUp(
        long id,
        [FromBody] UpdateOpportunityFollowUpRequest request,
        CancellationToken cancellationToken = default)
    {
        DateOnly? tanggal = null;
        if (!string.IsNullOrWhiteSpace(request.Tanggal))
        {
            if (!DateOnly.TryParse(request.Tanggal, out var parsed))
            {
                return BadRequest(new { message = $"Tanggal '{request.Tanggal}' tidak valid." });
            }
            tanggal = parsed;
        }

        var updated = await repository.UpdateFollowUpAsync(id, tanggal, cancellationToken);
        return updated ? NoContent() : NotFound(new { message = $"Lowongan {id} tidak ditemukan." });
    }

    /// <summary>
    /// Generates a first-draft cover letter for one opportunity by calling the Hermes
    /// gateway with Rholly's profile and the opportunity details. The result is a draft
    /// for Rholly to review — never an auto-submission.
    /// </summary>
    /// <param name="id">Opportunity id.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Draft cover letter generated.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No opportunity with this id.</response>
    /// <response code="502">The AI gateway could not produce a draft.</response>
    [HttpPost("{id}/lamaran-draft")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> GenerateLamaranDraft(
        long id,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var draft = await lamaranDraftService.GenerateAsync(id, cancellationToken);
            return draft is null
                ? NotFound(new { message = $"Lowongan {id} tidak ditemukan." })
                : Ok(draft);
        }
        catch (InvalidOperationException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Gagal membuat draft lamaran: gateway AI tidak tersedia." });
        }
    }

    /// <summary>Exports the curated opportunity list as CSV (RFC 4180, UTF-8 with BOM).</summary>
    /// <param name="status">Optional pipeline filter; omitted exports every stage.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">CSV file download.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Export(
        [FromQuery] string? status,
        CancellationToken cancellationToken = default)
    {
        var items = await repository.ListAsync(status, cancellationToken);

        var sb = new StringBuilder();
        sb.AppendLine("judul,perusahaan,lokasi,tipe,gaji,skor,status,followUpTanggal,ditemukan,link,catatan");
        foreach (var o in items)
        {
            sb.Append(Csv(o.Judul)).Append(',');
            sb.Append(Csv(o.Perusahaan)).Append(',');
            sb.Append(Csv(o.Lokasi)).Append(',');
            sb.Append(Csv(o.Tipe)).Append(',');
            sb.Append(Csv(o.Gaji ?? string.Empty)).Append(',');
            sb.Append(o.Skor?.ToString() ?? string.Empty).Append(',');
            sb.Append(Csv(o.Status)).Append(',');
            sb.Append(o.FollowUpTanggal?.ToString("yyyy-MM-dd") ?? string.Empty).Append(',');
            sb.Append(o.Ditemukan.ToString("yyyy-MM-dd")).Append(',');
            sb.Append(Csv(o.Link ?? string.Empty)).Append(',');
            sb.Append(Csv(o.Catatan ?? string.Empty)).Append('\n');
        }

        // UTF-8 BOM so Excel renders the CSV as UTF-8 rather than ANSI.
        var bytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(sb.ToString()))
            .ToArray();

        return File(bytes, "text/csv; charset=utf-8", $"jobs-{DateTime.UtcNow:yyyy-MM-dd}.csv");
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

/// <summary>Allowed pipeline status values.</summary>
public static class OpportunityStatuses
{
    public static readonly HashSet<string> All = new(StringComparer.OrdinalIgnoreCase)
    {
        "new", "applied", "interview", "offer", "closed",
    };

    public static bool Contains(string? status) =>
        status is not null && All.Contains(status);
}

/// <summary>Request body for <c>PATCH /api/jobs/{id}/status</c>.</summary>
public sealed record UpdateOpportunityStatusRequest(string Status);

/// <summary>Request body for <c>PATCH /api/jobs/{id}/follow-up</c>.</summary>
public sealed record UpdateOpportunityFollowUpRequest(string? Tanggal);
