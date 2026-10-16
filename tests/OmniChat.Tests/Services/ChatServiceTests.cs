using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using OmniChat.Api.Infrastructure.Options;
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

    private const string HermesEndpoint = "http://localhost:5000/v1/chat/completions";
    private const string LlmEndpoint = "https://openrouter.ai/api/v1/chat/completions";
    private const string LlmApiKey = "test-key";

    public ChatServiceTests()
    {
        _httpClientFactoryMock = new Mock<IHttpClientFactory>();
    }

    /// <summary>
    /// Creates a ChatService with a custom HttpMessageHandler that returns
    /// a specified SSE response body.
    /// </summary>
    /// <summary>
    /// Creates a ChatService wired to a fake transport. <paramref name="hermesApiKey"/>
    /// defaults to null so the Hermes-Bridge tests exercise the "no Authorization header" path.
    /// </summary>
    private ChatService CreateService(
        Func<HttpRequestMessage, HttpResponseMessage> handlerFunc,
        string? hermesApiKey = null,
        StreamingOptions? streaming = null)
    {
        var handler = new TestableHttpMessageHandler(handlerFunc);
        var client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        _httpClientFactoryMock
            .Setup(f => f.CreateClient("LLMClient"))
            .Returns(client);

        return new ChatService(
            _httpClientFactoryMock.Object,
            Options.Create(new HermesOptions { Endpoint = HermesEndpoint, ApiKey = hermesApiKey }),
            Options.Create(new LlmOptions { Endpoint = LlmEndpoint, ApiKey = LlmApiKey }),
            Options.Create(streaming ?? new StreamingOptions()),
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
    public async Task StreamChatResponseAsync_WhenEndpointUnreachable_EmitsSanitizedError()
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

        // Assert: an unreachable provider must surface a real error, not a fake success
        // ("Fallback Mode" demo text previously masked outages as working responses).
        Assert.NotEmpty(tokens);
        var combined = string.Join("", tokens);
        Assert.Contains("unreachable", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Fallback Mode", combined);

        // The raw transport error must not leak to the client.
        Assert.DoesNotContain("Connection refused", combined);
    }

    [Fact]
    public async Task StreamChatResponseAsync_WithHermesBridgeAndApiKey_SetsBearerAuthorizationHeader()
    {
        // Arrange: a configured Hermes API key must be forwarded as a Bearer token,
        // otherwise the gateway rejects the call.
        HttpRequestMessage? capturedRequest = null;
        var sseBody = "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n";
        var service = CreateService(
            req =>
            {
                capturedRequest = req;
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
                {
                    Content = new StringContent(sseBody, System.Text.Encoding.UTF8, "text/event-stream")
                };
            },
            hermesApiKey: "hermes-secret");

        var request = new ChatRequest
        {
            Model = "hermes",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = true
        };

        // Act
        await foreach (var _ in service.StreamChatResponseAsync(request)) { }

        // Assert
        Assert.NotNull(capturedRequest);
        var authHeader = capturedRequest!.Headers.Authorization;
        Assert.NotNull(authHeader);
        Assert.Equal("Bearer", authHeader!.Scheme);
        Assert.Equal("hermes-secret", authHeader.Parameter);
    }

    [Fact]
    public async Task StreamChatResponseAsync_UsesHermesEndpoint_InBridgeMode()
    {
        // Guards the strongly-typed options wiring: bridge mode must call Hermes:Endpoint.
        HttpRequestMessage? capturedRequest = null;
        var sseBody = "data: [DONE]\n\n";
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

        await foreach (var _ in service.StreamChatResponseAsync(request)) { }

        Assert.Equal(HermesEndpoint, capturedRequest!.RequestUri!.ToString());
    }

    [Fact]
    public async Task StreamChatResponseAsync_UsesLlmEndpoint_InDirectMode()
    {
        HttpRequestMessage? capturedRequest = null;
        var sseBody = "data: [DONE]\n\n";
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

        await foreach (var _ in service.StreamChatResponseAsync(request)) { }

        Assert.Equal(LlmEndpoint, capturedRequest!.RequestUri!.ToString());
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

        // Assert: sanitized error message — must NOT leak the upstream status code
        Assert.Single(tokens);
        Assert.Contains("Error", tokens[0]);
        Assert.DoesNotContain("InternalServerError", tokens[0]);
        Assert.DoesNotContain("500", tokens[0]);
    }

    [Fact]
    public async Task StreamChatResponseAsync_WhenNonSuccessStatus_DoesNotLeakProviderDetails()
    {
        // Arrange: handler returns 401 with a sensitive error body (e.g. API key hint)
        var sensitiveBody = """{"error":{"message":"Invalid API key: sk-or-v1-abc123","code":"invalid_api_key"}}""";
        var service = CreateService(req => new HttpResponseMessage(System.Net.HttpStatusCode.Unauthorized)
        {
            Content = new StringContent(sensitiveBody)
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

        // Assert: the sensitive upstream body must NOT appear in the client-facing token
        Assert.Single(tokens);
        var errorToken = tokens[0];
        Assert.DoesNotContain("sk-or-v1", errorToken);
        Assert.DoesNotContain("invalid_api_key", errorToken);
        Assert.DoesNotContain("Unauthorized", errorToken);
        Assert.DoesNotContain("401", errorToken);
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
        Assert.Equal(LlmApiKey, authHeader.Parameter);
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

    [Fact]
    public void IdleTimeout_IsNullWhenDisabledOrNonPositive()
    {
        // The deadline is opt-out: zero or a negative value must disable it entirely rather
        // than fire immediately and abort every stream.
        Assert.Equal(TimeSpan.FromSeconds(StreamingOptions.DefaultIdleTimeoutSeconds), new StreamingOptions().IdleTimeout);
        Assert.Equal(TimeSpan.FromSeconds(30), new StreamingOptions { IdleTimeoutSeconds = 30 }.IdleTimeout);
        Assert.Null(new StreamingOptions { IdleTimeoutSeconds = 0 }.IdleTimeout);
        Assert.Null(new StreamingOptions { IdleTimeoutSeconds = -5 }.IdleTimeout);
    }

    [Fact]
    public async Task StreamChatResponseAsync_SilentUpstream_ReportsProviderStoppedResponding()
    {
        // Arrange: the upstream accepts the request, answers 200, then sends nothing at all.
        var service = CreateService(
            _ => new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new HangingHttpContent() },
            streaming: new StreamingOptions { IdleTimeoutSeconds = 1 });

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        // Safety net: without the idle deadline this iteration would hang forever, so the outer
        // token ends it at 15 s. The test then fails with a cancellation instead of a timeout.
        using var guard = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        // Act
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request, guard.Token))
        {
            tokens.Add(token);
        }

        // Assert: one terminal token, and it is the idle-deadline message. A silent upstream must
        // surface as an error rather than a hang or an empty reply.
        Assert.Single(tokens);
        Assert.Equal("[Error: The AI provider stopped responding. Please try again.]", tokens[0]);
    }

    [Fact]
    public async Task StreamChatResponseAsync_RenewsIdleDeadlineOnEveryLine()
    {
        // Ten chunks 250 ms apart: ~2.25 s of streaming against a 2 s deadline. Every gap is far
        // under the deadline while the total is over it, so this only completes end-to-end if the
        // deadline is pushed out on every line read — a single fixed 2 s budget would cut the
        // stream off part way through.
        //
        // The ratio matters more than the absolute numbers: the per-gap slack must stay well above
        // the host's timer jitter. A 400 ms gap against a 1 s deadline (2.5x slack) was measurably
        // flaky on a 1-CPU container, where a nominal 400 ms Task.Delay was observed at 775-1244 ms.
        // 250 ms against 2 s gives 8x slack, and the elapsed-time assertion below still pins the
        // proof: the stream genuinely outlived the deadline.
        const int chunkCount = 10;
        const int gapMs = 250;
        var deadline = TimeSpan.FromSeconds(2);

        var segments = new List<(int DelayMs, byte[] Bytes)>();
        for (var i = 0; i < chunkCount; i++)
        {
            var frame = "data: {\"choices\":[{\"delta\":{\"content\":\"tok" + i + "\"}}]}\n\n";
            segments.Add((gapMs, System.Text.Encoding.UTF8.GetBytes(frame)));
        }

        var service = CreateService(
            _ => new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new PacedHttpContent(segments) },
            streaming: new StreamingOptions { IdleTimeoutSeconds = (int)deadline.TotalSeconds });

        var request = new ChatRequest
        {
            Model = "test",
            Messages = [new ChatMessage("user", "hi")],
            UseHermesBridge = false
        };

        using var guard = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // Act
        var tokens = new List<string>();
        await foreach (var token in service.StreamChatResponseAsync(request, guard.Token))
        {
            tokens.Add(token);
        }

        // Assert: every chunk arrived, in order, with no error token — the deadline was renewed.
        var expected = Enumerable.Range(0, chunkCount).Select(i => "tok" + i).ToArray();
        Assert.Equal(expected, tokens);

        // Guards against a vacuous pass: if the pacing collapsed the stream would finish inside the
        // deadline and prove nothing about renewal.
        Assert.True(sw.Elapsed >= deadline, $"stream finished in {sw.ElapsedMilliseconds} ms, inside the {deadline.TotalSeconds} s deadline — renewal was not exercised");
    }

    /// <summary>
    /// A body whose stream never produces a byte: an upstream that accepted the request and then
    /// black-holed it. The only way out of a read is cancellation by the stream's own deadline.
    /// </summary>
    private sealed class HangingHttpContent : HttpContent
    {
        protected override Task<Stream> CreateContentReadStreamAsync() =>
            Task.FromResult<Stream>(new HangingStream());

        // Not reached: ReadAsStreamAsync prefers CreateContentReadStreamAsync. Throwing makes a
        // silent fall back to buffering loud instead of yielding an empty, passing body.
        protected override Task SerializeToStreamAsync(Stream stream, System.Net.TransportContext? context) =>
            throw new NotSupportedException("HangingHttpContent is streamed, not serialized.");

        protected override bool TryComputeLength(out long length)
        {
            length = 0;
            return false;
        }
    }

    private sealed class HangingStream : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken).ConfigureAwait(false);
            return 0;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    /// <summary>
    /// Emits one pre-timed byte segment per read, so a test can drive a stream that keeps
    /// producing slowly instead of arriving in a single burst.
    /// </summary>
    private sealed class PacedHttpContent : HttpContent
    {
        private readonly IReadOnlyList<(int DelayMs, byte[] Bytes)> _segments;

        public PacedHttpContent(IReadOnlyList<(int DelayMs, byte[] Bytes)> segments) => _segments = segments;

        protected override Task<Stream> CreateContentReadStreamAsync() =>
            Task.FromResult<Stream>(new PacedStream(_segments));

        protected override Task SerializeToStreamAsync(Stream stream, System.Net.TransportContext? context) =>
            throw new NotSupportedException("PacedHttpContent is streamed, not serialized.");

        protected override bool TryComputeLength(out long length)
        {
            length = 0;
            return false;
        }
    }

    private sealed class PacedStream : Stream
    {
        private readonly IReadOnlyList<(int DelayMs, byte[] Bytes)> _segments;
        private int _index;
        private int _offset;

        public PacedStream(IReadOnlyList<(int DelayMs, byte[] Bytes)> segments) => _segments = segments;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_index >= _segments.Count) return 0;

            var (delayMs, bytes) = _segments[_index];
            if (_offset == 0)
            {
                await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
            }

            var count = Math.Min(buffer.Length, bytes.Length - _offset);
            bytes.AsSpan(_offset, count).CopyTo(buffer.Span);
            _offset += count;
            if (_offset >= bytes.Length)
            {
                _index++;
                _offset = 0;
            }

            return count;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
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
