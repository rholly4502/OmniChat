using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using OmniChat.Infrastructure.Services;

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
        var catalogService = new ModelCatalogService(
            new ConfigurationBuilder().Build());
        _controller = new ChatController(
            _chatServiceMock.Object,
            catalogService,
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
    public async Task StreamChat_WithInvalidModel_Returns400ProblemDetails()
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

        // Assert: returns 400 Bad Request with RFC 7807 ProblemDetails format
        Assert.Equal(StatusCodes.Status400BadRequest, _controller.Response.StatusCode);
        Assert.Equal("application/problem+json", _controller.Response.ContentType);
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        var body = await reader.ReadToEndAsync();
        Assert.Contains("\"title\"", body);
        Assert.Contains("validation", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("errors", body);
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

    [Fact]
    public void GetModels_ReturnsOkWithCatalog()
    {
        var result = _controller.GetModels();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var catalog = Assert.IsType<ModelCatalog>(ok.Value);
        Assert.NotEmpty(catalog.Agent);
        Assert.NotEmpty(catalog.Direct);
    }

    [Fact]
    public async Task StreamChat_WhenServiceThrows_SendsSanitizedErrorEvent()
    {
        // Arrange: service throws an exception with a sensitive message mid-stream
        var sensitiveMessage = "Connection to http://internal-host:5000 failed with API key sk-secret-123";
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(ThrowingAsyncEnumerable(sensitiveMessage));

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: the SSE error event must be sent but must NOT contain the exception message
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        var output = await reader.ReadToEndAsync();

        // The error event should be present
        Assert.Contains("error", output);

        // The sensitive exception details must NOT leak to the client
        Assert.DoesNotContain(sensitiveMessage, output);
        Assert.DoesNotContain("sk-secret-123", output);
        Assert.DoesNotContain("internal-host", output);
    }

    [Fact]
    public async Task StreamChat_WhenServiceThrows_SendsGenericErrorMessage()
    {
        // Arrange
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(ThrowingAsyncEnumerable("System.Net.Sockets.SocketException: Connection refused"));

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await _controller.StreamChat(request, CancellationToken.None);

        // Assert: the error event contains a generic message, not the exception details
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        var output = await reader.ReadToEndAsync();

        Assert.Contains("An internal error occurred", output);
        Assert.DoesNotContain("SocketException", output);
        Assert.DoesNotContain("Connection refused", output);
    }

    /// <summary>
    /// Creates an IAsyncEnumerable that yields one empty token, then throws.
    /// The yield is required for the async-iterator to compile (CS8419);
    /// the exception exercises the controller's catch block.
    /// </summary>
    private static async IAsyncEnumerable<string> ThrowingAsyncEnumerable(string exceptionMessage)
    {
        await Task.Yield();
        yield return string.Empty; // satisfy async-iterator requirement
        throw new InvalidOperationException(exceptionMessage);
    }
}
