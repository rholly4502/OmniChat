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
    /// <param name="offset">Number of newest rows to skip before returning (for list pagination).</param>
    /// <param name="search">When non-blank, only conversations whose title or a contained
    /// message matches the term are returned.</param>
    /// <param name="model">When non-blank, only conversations previously run on this model
    /// id are returned.</param>
    /// <param name="from">Inclusive lower bound on the conversation's updated-at time.</param>
    /// <param name="to">Inclusive upper bound (calendar day) on the conversation's updated-at time.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <returns>An array of summaries, empty for a guest or a caller with no history.</returns>
    /// <response code="200">Conversation summaries (possibly empty).</response>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ConversationSummary>>> List(
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0,
        [FromQuery] string? search = null,
        [FromQuery] string? model = null,
        [FromQuery] string? mode = null,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            // 200 with an empty array, not 403: the frontend renders its history panel from this
            // response, so "you have no history" is the guest's honest answer and needs no branch.
            return Ok(Array.Empty<ConversationSummary>());
        }

        var conversations = await _repository.ListConversationsAsync(owner, limit, offset, search, model, mode, from, to, cancellationToken);

        // Latest message content per conversation, for a one-line sidebar preview. The
        // guards tolerate a caller that omits the preview read (e.g. an old test
        // double), which Moq answers with a null result: substitute an empty dict so
        // the mapping below never touches a null dictionary.
        var previewsTask = _repository.GetLatestMessagePreviewsAsync(
                owner, conversations.Select(c => c.Id).ToList(), cancellationToken)
            ?? Task.FromResult<IReadOnlyDictionary<Guid, string?>>(new Dictionary<Guid, string?>());
        var previews = await previewsTask;
        previews ??= new Dictionary<Guid, string?>();

        return Ok(conversations.Select(c => ConversationSummary.From(c, previews.GetValueOrDefault(c.Id))).ToList());
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

    /// <summary>
    /// Duplicates a conversation into a fresh, independent thread with the same
    /// transcript, so an experiment can branch from an existing chat without
    /// mutating the original. The copy is unpinned/unarchived and its per-message
    /// feedback/bookmarks are reset.
    /// </summary>
    /// <param name="id">Source conversation id.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="201">The forked conversation and its transcript.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPost("{id:guid}/fork")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ConversationDetail>> Fork(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var forked = await _repository.ForkConversationAsync(id, owner, cancellationToken);
        if (forked is null)
        {
            return ConversationNotFound(id);
        }

        return StatusCode(StatusCodes.Status201Created, ConversationDetail.From(forked));
    }

    /// <summary>
    /// Aggregates the caller's token usage across every stored conversation. An admin
    /// uses this as the usage/audit overview; a guest gets the empty shape (200), so the
    /// frontend can render the same panel in both states without a branch.
    /// </summary>
    /// <param name="from">Optional window start (inclusive, UTC). Only conversations last
    /// updated at or after this instant are counted.</param>
    /// <param name="to">Optional window end (inclusive date; exclusive of the next day).
    /// Only conversations last updated before the following day are counted.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <returns>Aggregate token totals plus a per-model breakdown.</returns>
    /// <response code="200">Usage summary (possibly all-zero).</response>
    [HttpGet("usage")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<ConversationUsageSummary>> Usage(
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            // Same shape as the guest list: report "no usage" rather than a 403, so the
            // client never has to special-case an authenticated-but-empty audit view.
            return Ok(ConversationUsageSummary.Empty);
        }

        var summary = await _repository.GetUsageSummaryAsync(owner, from, to, cancellationToken);
        return Ok(summary);
    }

    /// <summary>
    /// Returns a per-day token usage breakdown across all of the caller's stored
    /// conversations, oldest day first. This is the daily view of the aggregate
    /// summary: each row carries that day's prompt/completion/total tokens, so a
    /// user can see how much they used on a given day. An admin sees real rows; a
    /// guest gets an empty list, exactly as a guest never sees history rows.
    /// </summary>
    /// <param name="from">Inclusive lower bound on the message's created date.</param>
    /// <param name="to">Inclusive upper bound (calendar day) on the message's created date.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Per-day usage rows (possibly empty).</response>
    [HttpGet("usage/daily")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ConversationDayUsage>>> DailyUsage(
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            return Ok(Array.Empty<ConversationDayUsage>());
        }

        var rows = await _repository.GetDailyUsageAsync(owner, from, to, cancellationToken);
        return Ok(rows);
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
    /// <summary>Archives or unarchives a conversation.</summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="request">Requested archive state.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Archive state applied.</response>
    /// <response code="400">Malformed body.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPut("{id:guid}/archive")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetArchived(
        Guid id,
        [FromBody] ArchiveConversationRequest request,
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

        var archived = await _repository.SetArchivedAsync(id, owner, request.IsArchived, cancellationToken);

        return archived ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>
    /// Sets or clears the caller's rating on one message of a conversation (audit feedback).
    /// </summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="messageId">Message id within the conversation.</param>
    /// <param name="request">Rating to store: "up", "down" or null to clear.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Rating applied.</response>
    /// <response code="400">Malformed body or an unknown feedback value.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPut("{id:guid}/messages/{messageId:guid}/feedback")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetFeedback(
        Guid id,
        Guid messageId,
        [FromBody] MessageFeedbackRequest request,
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

        MessageFeedback? feedback;
        if (request.Feedback is null)
        {
            feedback = null;
        }
        else
        {
            feedback = request.Feedback.ToLowerInvariant() switch
            {
                "up" => MessageFeedback.Up,
                "down" => MessageFeedback.Down,
                _ => null,
            };

            if (feedback is null)
            {
                return new ObjectResult(new ProblemDetails
                {
                    Title = "Validation Failed",
                    Status = StatusCodes.Status400BadRequest,
                    Detail = "Feedback must be \"up\", \"down\" or null.",
                    Instance = HttpContext.Request.Path,
                })
                {
                    StatusCode = StatusCodes.Status400BadRequest,
                    ContentTypes = { ProblemDetailsResponse.ContentType },
                };
            }
        }

        var applied = await _repository.SetMessageFeedbackAsync(id, messageId, owner, feedback, cancellationToken);
        return applied ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>
    /// Sets or clears the bookmark flag on one message of a conversation (audit).
    /// </summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="messageId">Message id within the conversation.</param>
    /// <param name="request">Bookmark state to store.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Bookmark state applied.</response>
    /// <response code="400">Malformed body.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPut("{id:guid}/messages/{messageId:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetBookmark(
        Guid id,
        Guid messageId,
        [FromBody] MessageBookmarkRequest request,
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

        var applied = await _repository.SetMessageBookmarkAsync(id, messageId, owner, request.IsBookmarked, cancellationToken);
        return applied ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>
    /// Persists a per-conversation model and/or mode change so resuming the thread
    /// resumes with the setup it last used, even before the next turn is sent.
    /// </summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="request">Model and/or mode to persist; null fields are left unchanged.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Settings applied.</response>
    /// <response code="400">Malformed body (unknown mode).</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpPut("{id:guid}/settings")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateSettings(
        Guid id,
        [FromBody] UpdateConversationSettingsRequest request,
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

        var updated = await _repository.SetConversationSettingsAsync(
            id, owner, request.Model, request.Mode, cancellationToken);

        return updated ? NoContent() : ConversationNotFound(id);
    }

    /// <summary>
    /// Deletes one message and every message newer than it (the equivalent of "rewind
    /// to before this turn"). The conversation itself is kept.
    /// </summary>
    /// <param name="id">Conversation id.</param>
    /// <param name="messageId">Message id within the conversation.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Message (and its successors) deleted.</response>
    /// <response code="404">Unknown id, someone else's conversation, or a guest caller.</response>
    [HttpDelete("{id:guid}/messages/{messageId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteMessage(
        Guid id,
        Guid messageId,
        CancellationToken cancellationToken = default)
    {
        var owner = AdminOwnerId();
        if (owner is null)
        {
            return ConversationNotFound(id);
        }

        var deleted = await _repository.DeleteMessageAsync(id, owner, messageId, cancellationToken);

        return deleted ? NoContent() : ConversationNotFound(id);
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
