using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using System.Text;
using System.Text.Json;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Chat endpoint that streams LLM responses via Server-Sent Events (SSE).
/// Supports both Hermes Bridge mode and Direct LLM mode.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Tags("Chat")]
public class ChatController : ControllerBase
{
    private readonly IChatService _chatService;
    private readonly ILogger<ChatController> _logger;

    public ChatController(IChatService chatService, ILogger<ChatController> logger)
    {
        _chatService = chatService;
        _logger = logger;
    }

    /// <summary>
    /// Streams a chat completion as SSE events. Each event is `data: {"content":"..."}`.
    /// Terminated by `data: [DONE]`.
    /// </summary>
    /// <param name="request">Chat request containing model, messages, and mode toggle.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <returns>SSE stream of chat tokens.</returns>
    /// <response code="200">SSE stream of tokens.</response>
    /// <response code="400">Invalid request body.</response>
    /// <response code="429">Rate limit exceeded.</response>
    [HttpPost("stream")]
    [EnableRateLimiting("per-ip")]
    [Produces("text/event-stream")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task StreamChat([FromBody] ChatRequest request, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            Response.ContentType = "application/json";
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage);
            await Response.WriteAsJsonAsync(new { errors }, cancellationToken);
            return;
        }

        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no"; 

        try
        {
            await foreach (var token in _chatService.StreamChatResponseAsync(request, cancellationToken))
            {
                var sseData = $"data: {JsonSerializer.Serialize(new { content = token })}\n\n";
                var bytes = Encoding.UTF8.GetBytes(sseData);
                
                await Response.Body.WriteAsync(bytes, cancellationToken);
                await Response.Body.FlushAsync(cancellationToken);
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
            var errorData = $"data: {JsonSerializer.Serialize(new { error = ex.Message })}\n\n";
            await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(errorData), cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
    }
}
