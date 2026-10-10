using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for ChatService SSE streaming, endpoint routing, and fallback mode.
/// Uses a custom DelegatingHandler to simulate HTTP responses without a real server.
/// </summary>
public class ChatServiceTests
{
    private readonly Mock<IHttpClientFactory> _httpClientFactoryMock;
    private readonly IConfiguration _configuration;

    public ChatServiceTests()
    {
        _configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Hermes:Endpoint"] = "http://localhost:5000/v1/chat/completions",
                ["LLM:Endpoint"] = "https://openrouter.ai/api/v1/chat/completions",
                ["LLM:ApiKey"] = "test-key"
            })
            .Build();

        _httpClientFactoryMock = new Mock<IHttpClientFactory>();
    }

    /// <summary>
    /// Creates a ChatService with a custom HttpMessageHandler that returns
    /// a specified SSE response body.
    /// </summary>
    private ChatService CreateService(Func<HttpRequestMessage, HttpResponseMessage> handlerFunc)
    {
        var handler = new TestableHttpMessageHandler(handlerFunc);
        var client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        _httpClientFactoryMock
            .Setup(f => f.CreateClient("LLMClient"))
            .Returns(client);

        return new ChatService(
            _httpClientFactoryMock.Object,
            _configuration,
            NullLogger<ChatService>.Instance);
    }

    [Fact]
    public async Task StreamChatResponseAsync_ParsesSSEChunksCorrectly()
    {
        // Arrange: simulate an SSE response with two content chunks then [DONE]
        var sseBody = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" World\"}}]}\n\ndata: [DONE]\n\n";

        var service = CreateService(req => new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(sseBody, System.Text.Encoding.UTF8, "text/event-stream")
        });

        var request = new ChatRequest
        {
            Model = "test-model",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Act: collect all streamed tokens
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request))
        {
            tokens.Add(token);
        }

        // Assert: tokens parsed from delta.content
        Assert.Equal(2, tokens.Count);
        Assert.Equal("Hello", tokens[0]);
        Assert.Equal(" World", tokens[1]);
    }

    [Fact]
    public async Task StreamChatResponseAsync_WhenEndpointUnreachable_ProducesFallbackTokens()
    {
        // Arrange: handler throws to simulate connection failure
        var service = CreateService(req => throw new HttpRequestException("Connection refused"));

        var request = new ChatRequest
        {
            Model = "test-model",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request))
        {
            tokens.Add(token);
        }

        // Assert: fallback mode produces content
        Assert.NotEmpty(tokens);
        var combined = string.Join("", tokens);
        Assert.Contains("Fallback Mode", combined);
        Assert.Contains("Hermes Bridge", combined);
    }

    [Fact]
    public async Task StreamChatResponseAsync_WhenNonSuccessStatus_ProducesErrorMessage()
    {
        // Arrange: handler returns 500
        var service = CreateService(req => new HttpResponseMessage(System.Net.HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("Internal Server Error")
        });

        var request = new ChatRequest
        {
            Model = "test-model",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Act
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request))
        {
            tokens.Add(token);
        }

        // Assert: error message about status code
        Assert.Single(tokens);
        Assert.Contains("InternalServerError", tokens[0]);
    }

    [Fact]
    public async Task StreamChatResponseAsync_WithHermesBridge_DoesNotSetAuthorizationHeader()
    {
        // Arrange: capture the request to verify no Authorization header
        HttpRequestMessage? capturedRequest = null;
        var sseBody = "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n";
        var service = CreateService(req =>
        {
            capturedRequest = req;
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(sseBody, System.Text.Encoding.UTF8, "text/event-stream")
            };
        });

        var request = new ChatRequest
        {
            Model = "hermes",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await foreach (var _ in service.StreamChatResponseAsync(request)) { }

        // Assert: no Authorization header when using Hermes Bridge
        Assert.NotNull(capturedRequest);
        Assert.False(capturedRequest!.Headers.Contains("Authorization"));
    }

    [Fact]
    public async Task StreamChatResponseAsync_WithDirectMode_SetsAuthorizationHeader()
    {
        // Arrange
        HttpRequestMessage? capturedRequest = null;
        var sseBody = "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n";
        var service = CreateService(req =>
        {
            capturedRequest = req;
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(sseBody, System.Text.Encoding.UTF8, "text/event-stream")
            };
        });

        var request = new ChatRequest
        {
            Model = "openrouter/model",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Act
        await foreach (var _ in service.StreamChatResponseAsync(request)) { }

        // Assert: Authorization header present with Bearer token
        Assert.NotNull(capturedRequest);
        Assert.True(capturedRequest!.Headers.Contains("Authorization"));
        var authHeader = capturedRequest.Headers.Authorization!;
        Assert.Equal("Bearer", authHeader.Scheme);
        Assert.Equal("test-key", authHeader.Parameter);
    }

    [Fact]
    public async Task StreamChatResponseAsync_SkipsMalformedJsonChunks()
    {
        // Arrange: mix valid and invalid SSE lines
        var sseBody = "data: {\"choices\":[{\"delta\":{\"content\":\"good\"}}]}\n\ndata: {invalid json}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"after\"}}]}\n\ndata: [DONE]\n\n";

        var service = CreateService(req => new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(sseBody, System.Text.Encoding.UTF8, "text/event-stream")
        });

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Act
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request))
        {
            tokens.Add(token);
        }

        // Assert: only valid chunks parsed, malformed skipped
        Assert.Equal(2, tokens.Count);
        Assert.Equal("good", tokens[0]);
        Assert.Equal("after", tokens[1]);
    }

    /// <summary>
    /// Custom HttpMessageHandler that delegates to a function for testing.
    /// </summary>
    private class TestableHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handlerFunc;

        public TestableHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handlerFunc)
        {
            _handlerFunc = handlerFunc;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            try
            {
                return Task.FromResult(_handlerFunc(request));
            }
            catch (Exception ex)
            {
                return Task.FromException<HttpResponseMessage>(ex);
            }
        }
    }
}
