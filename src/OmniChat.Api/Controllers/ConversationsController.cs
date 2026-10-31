using Microsoft.AspNetCore.Mvc;
using OmniChat.Api.Infrastructure;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Reads and maintains the caller's stored chat history.
/// </summary>
/// <remarks>
/// The write side lives in the streaming endpoint (<see cref="IChatTurnRecorder"/>), which files
/// every turn no matter who sent it. This controller is the read side and the only place the
/// admin/guest split is enforced: a guest gets an empty list and a 404 for every id, rather than a
/// 403 — a guest has no history rows to distinguish, and 404 keeps an id from being confirmed as
/// existing.
/// </remarks>
[ApiController]
[Route("api/conversations")]
[Tags("Conversations")]
public sealed class ConversationsController : ControllerBase
{
    private readonly IChatHistoryRepository _repository;
    private readonly IChatAccessPolicy _accessPolicy;

    public ConversationsController(IChatHistoryRepository repository, IChatAccessPolicy accessPolicy)
    {
        _repository = repository;
        _accessPolicy = accessPolicy;
    }

    /// <summary>
    /// Lists the caller's conversations, most recently updated first, without message bodies.
    /// </summary>
    /// <param name="limit">Maximum rows to return; clamped by the repository to 1–200.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <returns>An array of summaries, empty for a guest or a caller with no history.</returns>
    /// <response code="200">Conversation summaries (possibly empty).</response>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ConversationSummary>>> List(
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            // 200 with an empty array, not 403: the frontend renders its history panel from this
            // response, so "you have no history" is the guest's honest answer and needs no branch.
            return Ok(Array.Empty<ConversationSummary>());
        }

        var conversations = await _repository.ListConversationsAsync(owner, limit, cancellationToken);

        return Ok(conversations.Select(ConversationSummary.From).ToList());
    }

    /// <summary>Returns one conversation with its transcript, oldest message first.</summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">The conversation and its messages.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ConversationDetail>> Get(Guid id, CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var conversation = await _repository.GetConversationAsync(id, owner, cancellationToken);

        return conversation is null ? ConversationNotFound(id) : Ok(ConversationDetail.From(conversation));
    }

    /// <summary>Renames a conversation.</summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="request">New title.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Renamed.</response>
    /// <response code="400">Missing or over-long title.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPatch("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Rename(
        Guid id,
        [FromBody] RenameConversationRequest request,
        CancellationToken cancellationToken = default)
    {
        // [ApiController] rejects an invalid body in the MVC pipeline, but action filters do not
        // run when the action is called directly, so the check is repeated for unit-testability
        // and as defense in depth — the same arrangement as ChatController.StreamChat.
        if (!ModelState.IsValid)
        {
            return ValidationProblemObject();
        }

        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var renamed = await _repository.RenameConversationAsync(
            id, owner, request.Title.Trim(), cancellationToken);

        return renamed ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>Pins or unpins a conversation.</summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="request">Requested pin state.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Pin state applied.</response>
    /// <response code="400">Malformed body.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPut("{id:guid}/pin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetPinned(
        Guid id,
        [FromBody] PinConversationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblemObject();
        }

        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var pinned = await _repository.PinConversationAsync(id, owner, request.IsPinned, cancellationToken);

        return pinned ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>Deletes a conversation and its messages.</summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Deleted.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var deleted = await _repository.DeleteConversationAsync(id, owner, cancellationToken);

        return deleted ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>
    /// Owner tag to query with, or <c>null</c> when the caller may not read history at all.
    /// </summary>
    /// <remarks>
    /// Both halves are needed together: <see cref="ChatIdentity.ResolveUserId"/> still names an
    /// owner for a guest (so their turns are filed), which is exactly why access has to be checked
    /// first instead of relying on the query to come back empty.
    /// </remarks>
    private string? AdminOwnerId() =>
        _accessPolicy.Resolve(HttpContext) == ChatAccess.Admin ? ChatIdentity.ResolveUserId(HttpContext) : null;

    /// <summary>
    /// A 404 in <c>application/problem+json</c>. Built as an <see cref="ObjectResult"/> rather than
    /// via <c>Problem()</c> so it renders without an <c>IProblemDetailsFactory</c>, which keeps the
    /// action testable outside the MVC pipeline.
    /// </summary>
    private ObjectResult ConversationNotFound(Guid id) => new(new ProblemDetails
    {
        Title = "Not Found",
        Status = StatusCodes.Status404NotFound,
        Detail = $"No conversation with id {id} belongs to this caller.",
        Instance = HttpContext.Request.Path,
    })
    {
        StatusCode = StatusCodes.Status404NotFound,
        ContentTypes = { ProblemDetailsResponse.ContentType },
    };

    private ObjectResult ValidationProblemObject()
    {
        var details = new ValidationProblemDetails(ModelState) { Title = "Validation Failed" };
        details.Extensions["traceId"] = HttpContext.TraceIdentifier;

        return new ObjectResult(details)
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { ProblemDetailsResponse.ContentType },
        };
    }
}
