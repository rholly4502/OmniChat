using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Controllers;

/// <summary>
/// Unit tests for ChatController SSE streaming, validation, and error handling.
/// Uses a mock IChatService and a manually constructed DefaultHttpContext.
/// </summary>
public class ChatControllerTests
{
    private readonly Mock<IChatService> _chatServiceMock;
    private readonly ChatController _controller;

    public ChatControllerTests()
    {
        _chatServiceMock = new Mock<IChatService>();
        _controller = new ChatController(
            _chatServiceMock.Object,
            NullLogger<ChatController>.Instance);

        // Set up a real HttpContext for SSE streaming
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                Response = { Body = new MemoryStream() }
            }
        };
    }

    [Fact]
    public async Task StreamChat_SetsSSEContentType()
    {
        // Arrange: mock service returns empty stream (just completes)
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(AsyncEnumerable.Empty<string>());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert
        Assert.Equal("text/event-stream", _controller.Response.ContentType);
    }

    [Fact]
    public async Task StreamChat_EmitsDoneMarker()
    {
        // Arrange: mock service returns two tokens
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello", "World" }.ToAsyncEnumerable());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: response body contains [DONE]
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        var output = await reader.ReadToEndAsync();
        Assert.Contains("data: [DONE]", output);
    }

    [Fact]
    public async Task StreamChat_StreamsTokenContent()
    {
        // Arrange
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello", "World" }.ToAsyncEnumerable());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: response body contains both tokens
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        var output = await reader.ReadToEndAsync();
        Assert.Contains("Hello", output);
        Assert.Contains("World", output);
    }

    [Fact]
    public async Task StreamChat_WithInvalidModel_Returns400()
    {
        // Arrange: add model validation error
        _controller.ModelState.AddModelError("Messages", "Messages cannot be empty.");

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: returns 400 Bad Request
        Assert.Equal(StatusCodes.Status400BadRequest, _controller.Response.StatusCode);
        Assert.StartsWith("application/json", _controller.Response.ContentType);
    }

    [Fact]
    public async Task StreamChat_SetsSSEHeaders()
    {
        // Arrange
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(AsyncEnumerable.Empty<string>());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: SSE headers are set
        Assert.Equal("no-cache", _controller.Response.Headers["Cache-Control"]);
        Assert.Equal("keep-alive", _controller.Response.Headers["Connection"]);
        Assert.Equal("no", _controller.Response.Headers["X-Accel-Buffering"]);
    }
}
