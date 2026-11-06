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
}
