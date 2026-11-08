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
public sealed class JobsController(IOpportunityRepository repository) : ControllerBase
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
