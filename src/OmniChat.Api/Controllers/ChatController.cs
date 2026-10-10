using Microsoft.AspNetCore.Mvc;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using System.Text;
using System.Text.Json;

namespace OmniChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    private readonly IChatService _chatService;
    private readonly ILogger<ChatController> _logger;

    public ChatController(IChatService chatService, ILogger<ChatController> logger)
    {
        _chatService = chatService;
        _logger = logger;
    }

    [HttpPost("stream")]
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
