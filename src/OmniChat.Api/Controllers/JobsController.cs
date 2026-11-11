using Microsoft.AspNetCore.Mvc;
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

