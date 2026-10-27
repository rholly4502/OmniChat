using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OmniChat.Api.Infrastructure;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Chat endpoint that streams LLM responses via Server-Sent Events (SSE).
/// Supports both Hermes Bridge mode and Direct LLM mode.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Tags("Chat")]
public sealed class ChatController : ControllerBase
{
    private readonly IChatService _chatService;
    private readonly IModelCatalogService _modelCatalogService;
    private readonly IChatTurnRecorder _turnRecorder;
    private readonly IChatAccessPolicy _accessPolicy;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        IChatService chatService,
        IModelCatalogService modelCatalogService,
        IChatTurnRecorder turnRecorder,
        IChatAccessPolicy accessPolicy,
        ILogger<ChatController> logger)
    {
        _chatService = chatService;
        _modelCatalogService = modelCatalogService;
        _turnRecorder = turnRecorder;
        _accessPolicy = accessPolicy;
        _logger = logger;
    }

    /// <summary>
    /// Returns the model catalog advertised to clients, grouped by chat mode.
    /// </summary>
    /// <returns>JSON object with <c>agent</c> and <c>direct</c> model arrays.</returns>
    /// <response code="200">Model catalog.</response>
    [HttpGet("/api/models")]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<ModelCatalog> GetModels() => Ok(_modelCatalogService.GetCatalog());

    /// <summary>
    /// Streams a chat completion as SSE events. Each event is `data: {"content":"..."}`.
    /// Terminated by `data: [DONE]`.
    /// </summary>
    /// <param name="request">Chat request containing model, messages, and mode toggle.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <returns>SSE stream of chat tokens.</returns>
    /// <response code="200">SSE stream of tokens.</response>
    /// <response code="400">Invalid request body.</response>
    /// <response code="401">Missing or invalid credentials.</response>
    /// <response code="429">Rate limit exceeded.</response>
    [HttpPost("stream")]
    [EnableRateLimiting("chat")]
    [Produces("text/event-stream")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task StreamChat([FromBody] ChatRequest request, CancellationToken cancellationToken)
    {
        // [ApiController] + ApiBehaviorOptions handle invalid model state automatically
        // in the MVC pipeline. This manual check provides defense-in-depth and makes
        // the controller unit-testable (action filters don't run in direct unit tests).
        if (!ModelState.IsValid)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            Response.ContentType = ProblemDetailsResponse.ContentType;
            var details = new ValidationProblemDetails(ModelState)
            {
                Title = "Validation Failed",
            };
            details.Extensions["traceId"] = HttpContext.TraceIdentifier;
            await Response.WriteAsync(JsonSerializer.Serialize(details, ProblemDetailsJson.Options), cancellationToken);
            return;
        }

        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no";

        // Security boundary: an anonymous guest must never reach the Hermes agent gateway, which
        // proxies the operator's credentials and tools (GitHub, terminal, memory). Force guests
        // onto the direct LLM provider, which carries no agent tools.
        if (_accessPolicy.Resolve(HttpContext) == ChatAccess.Guest)
        {
            request.UseHermesBridge = false;
        }

        // History is best-effort by contract: the recorder swallows storage failures, so a
        // locked or missing database cannot cost the user an answer that would have streamed.
        var userId = ChatIdentity.ResolveUserId(HttpContext);
        var conversationId = await _turnRecorder.StartTurnAsync(
            new ChatTurn(
                request.ConversationId,
                userId,
                request.UseHermesBridge ? "agent" : "direct",
                request.Model,
                LastUserPrompt(request)),
            cancellationToken);

        if (conversationId is Guid started)
        {
            // First frame, before any token: the client needs the id to continue this thread.
            await WriteEventAsync(new { conversationId = started }, cancellationToken);
        }

        // The service reports its own liveness as a status frame and leaves the assistant's
        // text alone, so the two channels can never be mixed up. The phase is sent by the
        // service; this layer only decides which envelope it travels in.
        var latestPhase = default(string);
        var reply = new StringBuilder();

        try
        {
            await foreach (var token in _chatService.StreamChatResponseAsync(request, cancellationToken))
            {
                var phase = ProgressPhase.TryRead(token);
                if (phase is not null)
                {
                    if (phase != latestPhase)
                    {
                        latestPhase = phase;
                        await WriteEventAsync(new { status = phase }, cancellationToken);
                    }

                    continue;
                }

                reply.Append(token);
                await WriteEventAsync(new { content = token }, cancellationToken);
            }

            await Response.Body.WriteAsync(Encoding.UTF8.GetBytes("data: [DONE]\n\n"), cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Chat stream was cancelled by the client.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred during chat SSE streaming.");
            // Sanitize: never send internal exception details to the client.
            // The SSE response has already started (200 OK), so ExceptionHandlingMiddleware
            // cannot intervene — send a generic error event instead of ex.Message.
            await WriteEventAsync(
                new { error = "An internal error occurred during streaming." },
                CancellationToken.None);
        }
        finally
        {
            // Runs on success, on failure and on client disconnect, so an interrupted answer is
            // still filed: a turn with a question and no reply would read as lost data in the log.
            if (conversationId is Guid recorded)
            {
                await _turnRecorder.CompleteTurnAsync(recorded, userId, reply.ToString(), CancellationToken.None);
            }
        }
    }

    /// <summary>
    /// The prompt to file as the user's half of the turn: the last <c>user</c> message, which is
    /// the one this request is asking about even when the client replays the whole thread.
    /// </summary>
    private static string LastUserPrompt(ChatRequest request) =>
        request.Messages.LastOrDefault(message => message.Role == "user")?.Content ?? string.Empty;

    /// <summary>
    /// Reads an upstream status frame out of a streamed token, or <c>null</c> when the token is
    /// assistant text.
    /// </summary>
    /// <remarks>
    /// A plain string comparison rather than a JSON parse: token-level parsing would run for
    /// every chunk of every answer, and the only statuses that exist come from
    /// <see cref="ProgressMessages"/>.
    /// </remarks>
    private static string? TryReadProgressPhase(string token) => ProgressPhase.TryRead(token);

    /// <summary>Serialises <paramref name="payload"/> as one SSE <c>data:</c> frame and flushes it.</summary>
    private async Task WriteEventAsync(object payload, CancellationToken cancellationToken)
    {
        var frame = $"data: {JsonSerializer.Serialize(payload)}\n\n";
        await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(frame), cancellationToken);
        await Response.Body.FlushAsync(cancellationToken);
    }
}
