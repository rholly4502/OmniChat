using Microsoft.AspNetCore.Mvc;
using OmniChat.Application.Interfaces;

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
}
