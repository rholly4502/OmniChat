using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OmniChat.Api.Infrastructure;
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
    private readonly ILogger<ChatController> _logger;

    public ChatController(IChatService chatService, IModelCatalogService modelCatalogService, ILogger<ChatController> logger)
    {
        _chatService = chatService;
        _modelCatalogService = modelCatalogService;
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

        // The service reports its own liveness as a status frame and leaves the assistant's
        // text alone, so the two channels can never be mixed up. The phase is sent by the
        // service; this layer only decides which envelope it travels in.
        var latestPhase = default(string);

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
    }

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
