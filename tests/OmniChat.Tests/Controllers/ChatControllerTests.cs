using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Api.Infrastructure.Auth;
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
    private readonly Mock<IChatTurnRecorder> _turnRecorderMock;
    private readonly Mock<IChatAccessPolicy> _accessPolicyMock;
    private readonly ChatController _controller;

    public ChatControllerTests()
    {
        _chatServiceMock = new Mock<IChatService>();
        _turnRecorderMock = new Mock<IChatTurnRecorder>();
        _accessPolicyMock = new Mock<IChatAccessPolicy>();
        _accessPolicyMock.Setup(p => p.Resolve(It.IsAny<HttpContext>())).Returns(ChatAccess.Admin);
        var catalogService = new ModelCatalogService(
            new ConfigurationBuilder().Build());
        _controller = new ChatController(
            _chatServiceMock.Object,
            catalogService,
            _turnRecorderMock.Object,
            _accessPolicyMock.Object,
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
    public async Task StreamChat_ConvertsUpstreamStatusFrames_IntoStatusEvents()
    {
        // The service reports liveness on the same stream as assistant text. The controller
        // is the layer that knows about SSE, so it is the one that must re-envelope a status
        // frame as {"status":"…"} and — critically — never as {"content":"…"}: leaking the
        // sentinel into content would print "[status: …]" in the chat transcript.
        var phase = ProgressMessages.Working;
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { ProgressPhase.Encode(phase), "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        var output = ReadBody();
        Assert.Contains($"data: {{\"status\":\"{phase}\"}}", output);
        Assert.DoesNotContain(ProgressPhase.Encode(phase), output);
        Assert.Contains("data: {\"content\":\"Hello\"}", output);
    }

    [Fact]
    public async Task StreamChat_EmitsTheStatusEvent_BeforeAnyContent()
    {
        // Ordering is the whole feature: a progress frame that arrives after the answer has
        // already started cannot explain the wait.
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { ProgressPhase.Encode(ProgressMessages.Working), "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        var output = ReadBody();
        Assert.True(
            output.IndexOf("\"status\"", StringComparison.Ordinal) < output.IndexOf("\"content\"", StringComparison.Ordinal),
            "The status event must be written before the first content event.");
    }

    [Fact]
    public async Task StreamChat_DoesNotRepeatTheSameStatusEvent()
    {
        // The heartbeat can fire several times while the agent works. Re-sending an unchanged
        // phase would make screen readers re-announce it and churn the wire for nothing, so
        // consecutive duplicates are collapsed.
        var frame = ProgressPhase.Encode(ProgressMessages.Working);
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { frame, frame, "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        var output = ReadBody();
        Assert.Equal(1, output.Split("\"status\"").Length - 1);
    }

    [Fact]
    public async Task StreamChat_StillPassesOrdinaryTextThrough_WhenItLooksLikeASentinel()
    {
        // Guard against over-eager detection: only a well-formed [status: …] frame is a
        // progress report. An assistant that writes "[status]" or "[Error: …]"-style prose,
        // or a bracketed word with no status prefix, must still reach the transcript.
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "[status]", "[other: x]", "[" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        var output = ReadBody();
        Assert.Contains("data: {\"content\":\"[status]\"}", output);
        Assert.Contains("data: {\"content\":\"[other: x]\"}", output);
        Assert.Contains("data: {\"content\":\"[\"}", output);
        Assert.DoesNotContain("\"status\":", output);
    }

    [Fact]
    public async Task StreamChat_RecordsTheUserTurn_BeforeTheFirstToken()
    {
        // The question is filed before the upstream is called, so an aborted generation still
        // leaves a record of what was asked.
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        _turnRecorderMock.Verify(
            r => r.StartTurnAsync(
                It.Is<ChatTurn>(t =>
                    t.ConversationId == null &&
                    t.UserId == "admin" &&
                    t.Mode == "direct" &&
                    t.Model == "test" &&
                    t.UserContent == "hi"),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task StreamChat_RecordsTheLastUserMessage_WhenTheClientReplaysTheThread()
    {
        // The client sends the whole conversation on every turn; the new question is the last
        // user message, not the first one.
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(AsyncEnumerable.Empty<string>());

        var request = new ChatRequest
        {
            Model = "test",
            UseHermesBridge = true,
            Messages =
            [
                new ChatMessage("user", "pertanyaan lama"),
                new ChatMessage("assistant", "jawaban lama"),
                new ChatMessage("user", "pertanyaan baru"),
            ],
        };

        await _controller.StreamChat(request, CancellationToken.None);

        _turnRecorderMock.Verify(
            r => r.StartTurnAsync(It.Is<ChatTurn>(t => t.UserContent == "pertanyaan baru" && t.Mode == "agent"), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task StreamChat_EmitsTheConversationId_BeforeAnyContent()
    {
        var conversationId = Guid.CreateVersion7();
        _turnRecorderMock
            .Setup(r => r.StartTurnAsync(It.IsAny<ChatTurn>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversationId);
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        var output = ReadBody();
        Assert.Contains($"data: {{\"conversationId\":\"{conversationId}\"}}", output);
        Assert.True(
            output.IndexOf("conversationId", StringComparison.Ordinal) < output.IndexOf("\"content\"", StringComparison.Ordinal),
            "The conversation id must reach the client before the first token.");
    }

    [Fact]
    public async Task StreamChat_EmitsNoConversationIdFrame_WhenTheTurnWasNotRecorded()
    {
        // Recording is best-effort: when it is disabled or failed, the stream is unchanged.
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        Assert.DoesNotContain("conversationId", ReadBody());
    }

    [Fact]
    public async Task StreamChat_CompletesTheTurn_WithTheConcatenatedReply()
    {
        var conversationId = Guid.CreateVersion7();
        _turnRecorderMock
            .Setup(r => r.StartTurnAsync(It.IsAny<ChatTurn>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversationId);
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { "Hello", " ", "World" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        _turnRecorderMock.Verify(
            r => r.CompleteTurnAsync(conversationId, "admin", "Hello World", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task StreamChat_DoesNotFileStatusFrames_AsPartOfTheReply()
    {
        // The heartbeat is transport, not answer. Saving it would put "[status: …]" in history.
        var conversationId = Guid.CreateVersion7();
        _turnRecorderMock
            .Setup(r => r.StartTurnAsync(It.IsAny<ChatTurn>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversationId);
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(new[] { ProgressPhase.Encode(ProgressMessages.Working), "Hello" }.ToAsyncEnumerable());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        _turnRecorderMock.Verify(
            r => r.CompleteTurnAsync(conversationId, "admin", "Hello", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task StreamChat_CompletesTheTurn_EvenWhenTheUpstreamFails()
    {
        // A half answer is still evidence; a turn with a question and no reply reads as data loss.
        var conversationId = Guid.CreateVersion7();
        _turnRecorderMock
            .Setup(r => r.StartTurnAsync(It.IsAny<ChatTurn>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversationId);
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(ThrowingStream());

        await _controller.StreamChat(NewRequest(), CancellationToken.None);

        _turnRecorderMock.Verify(
            r => r.CompleteTurnAsync(conversationId, "admin", "partial", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    private static async IAsyncEnumerable<string> ThrowingStream()
    {
        yield return "partial";
        await Task.Yield();
        throw new InvalidOperationException("upstream exploded");
    }

    [Fact]
    public async Task StreamChat_ForcesDirectMode_ForAGuest_DespiteAgentRequest()
    {
        // A guest (no credentials) that asks for the Hermes bridge must never reach the agent
        // gateway. The controller rewrites the request to direct LLM before it reaches the service.
        _accessPolicyMock.Setup(p => p.Resolve(It.IsAny<HttpContext>())).Returns(ChatAccess.Guest);

        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Returns(AsyncEnumerable.Empty<string>());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true,
        };

        await _controller.StreamChat(request, CancellationToken.None);

        Assert.False(request.UseHermesBridge, "The request must be rewritten in place so the recorder also sees direct mode.");
    }

    [Fact]
    public async Task StreamChat_KeepsAgentMode_ForAnAdmin_WhenRequested()
    {
        // The access policy resolves Admin (the default), so an agent request must stay in agent mode.
        ChatRequest? seen = null;
        _chatServiceMock
            .Setup(s => s.StreamChatResponseAsync(
                It.IsAny<ChatRequest>(), It.IsAny<CancellationToken>()))
            .Callback<ChatRequest, CancellationToken>((req, _) => seen = req)
            .Returns(AsyncEnumerable.Empty<string>());

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true,
        };

        await _controller.StreamChat(request, CancellationToken.None);

        Assert.True(seen?.UseHermesBridge ?? false, "Admin agent request must stay on the Hermes bridge.");
    }

    private ChatRequest NewRequest() => new()
    {
        Model = "test",
        Messages = [new ChatMessage("user", "hi")],
        UseHermesBridge = false
    };

    private string ReadBody()
    {
        _controller.Response.Body.Position = 0;
        using var reader = new StreamReader(_controller.Response.Body);
        return reader.ReadToEnd();
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
