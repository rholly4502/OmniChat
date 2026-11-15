using Microsoft.AspNetCore.Mvc;
using System.Text;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Read-only view over the curated job-opportunity list plus operator CRUD for manual
/// curation. The list is maintained by an agent cron and imported via the seeder; this
/// API serves what was stored. Routes are NOT guest-exempt, so anonymous callers get
/// 401 — opportunities are private.
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

    /// <summary>Adds a manually curated opportunity (operator only).</summary>
    /// <param name="request">Job details.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="201">Opportunity created.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Create(
        [FromBody] JobWriteRequest request, CancellationToken cancellationToken = default)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var opportunity = new Opportunity
        {
            Judul = request.Judul.Trim(),
            Perusahaan = request.Perusahaan.Trim(),
            Lokasi = request.Lokasi.Trim(),
            Tipe = request.Tipe.Trim(),
            Gaji = TrimOrNull(request.Gaji),
            Skor = request.Skor,
            Link = TrimOrNull(request.Link),
            Catatan = TrimOrNull(request.Catatan),
            Status = (request.Status ?? "new").ToLowerInvariant(),
            FollowUpTanggal = ParseDateOrNull(request.FollowUpTanggal),
            Ditemukan = DateOnly.ParseExact(request.Ditemukan, "yyyy-MM-dd"),
            // Manual rows get a distinct SourceId prefix so the seeder's dedup can
            // never mistake them for an auto-imported row.
            SourceId = "web-" + Guid.NewGuid().ToString("N")[..8],
        };

        var created = await repository.AddAsync(opportunity, cancellationToken);
        return CreatedAtAction(nameof(List), new { }, created);
    }

    /// <summary>Replaces a manually curated opportunity's editable fields (operator only).</summary>
    /// <param name="id">Opportunity id.</param>
    /// <param name="request">Job details.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Opportunity updated.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No opportunity with this id.</response>
    [HttpPut("{id:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(
        long id,
        [FromBody] JobWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var opportunity = new Opportunity
        {
            Id = id,
            Judul = request.Judul.Trim(),
            Perusahaan = request.Perusahaan.Trim(),
            Lokasi = request.Lokasi.Trim(),
            Tipe = request.Tipe.Trim(),
            Gaji = TrimOrNull(request.Gaji),
            Skor = request.Skor,
            Link = TrimOrNull(request.Link),
            Catatan = TrimOrNull(request.Catatan),
            Status = (request.Status ?? "new").ToLowerInvariant(),
            FollowUpTanggal = ParseDateOrNull(request.FollowUpTanggal),
            Ditemukan = DateOnly.ParseExact(request.Ditemukan, "yyyy-MM-dd"),
        };

        var updated = await repository.UpdateAsync(opportunity, cancellationToken);
        if (!updated)
        {
            return NotFound(new { message = $"Lowongan {id} tidak ditemukan." });
        }
        return Ok(await repository.GetByIdAsync(id, cancellationToken));
    }

    /// <summary>Deletes a manually curated opportunity (operator only).</summary>
    /// <param name="id">Opportunity id.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Opportunity deleted.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No opportunity with this id.</response>
    [HttpDelete("{id:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(long id, CancellationToken cancellationToken = default)
    {
        var deleted = await repository.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound(new { message = $"Lowongan {id} tidak ditemukan." });
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
    /// <summary>Validates a write request, returning a 400 BadRequest or null when valid.</summary>
    private IActionResult? Validate(JobWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Judul))
        {
            return BadRequest(new { message = "'judul' wajib diisi." });
        }
        if (string.IsNullOrWhiteSpace(request.Perusahaan))
        {
            return BadRequest(new { message = "'perusahaan' wajib diisi." });
        }
        if (string.IsNullOrWhiteSpace(request.Lokasi))
        {
            return BadRequest(new { message = "'lokasi' wajib diisi." });
        }
        if (!string.IsNullOrWhiteSpace(request.Status) && !OpportunityStatuses.Contains(request.Status))
        {
            return BadRequest(new { message = $"Status '{request.Status}' tidak dikenal." });
        }
        if (!DateOnly.TryParseExact(request.Ditemukan, "yyyy-MM-dd", out _))
        {
            return BadRequest(new { message = "'ditemukan' must be a valid YYYY-MM-DD date." });
        }
        if (!string.IsNullOrWhiteSpace(request.FollowUpTanggal) &&
            !DateOnly.TryParse(request.FollowUpTanggal, out _))
        {
            return BadRequest(new { message = "'followUpTanggal' must be a valid YYYY-MM-DD date or null." });
        }
        if (request.Skor is < 0 or > 100)
        {
            return BadRequest(new { message = "'skor' must be between 0 and 100." });
        }
        return null;
    }

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateOnly? ParseDateOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : DateOnly.Parse(value);

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

/// <summary>Request body for creating or updating a job opportunity.</summary>
public sealed record JobWriteRequest(
    string Judul,
    string Perusahaan,
    string Lokasi,
    string Tipe,
    string? Gaji,
    int? Skor,
    string? Link,
    string? Catatan,
    string? Status,
    string? FollowUpTanggal,
    string Ditemukan);
