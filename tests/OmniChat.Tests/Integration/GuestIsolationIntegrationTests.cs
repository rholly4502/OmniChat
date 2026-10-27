using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Proves the guest-mode security boundary over the real HTTP pipeline: an anonymous guest can
/// stream chat (guest-exempt route) but is forced off the Hermes agent gateway, and can never
/// read or list stored history.
/// </summary>
public class GuestIsolationIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Secret = "integration-secret";

    private const string HermesStub = "http://hermes-stub.invalid/v1/chat/completions";
    private const string HermesAdminKey = "hermes-admin-key";

    private const string LlmDirectStub = "http://llm-direct-stub.invalid/v1/chat/completions";
    private const string LlmDirectKey = "llm-direct-key";

    private readonly WebApplicationFactory<Program> _factory;

    public GuestIsolationIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

    private WebApplicationFactory<Program> WithRecordingTransport(RecordingHttpClientFactory rec)
    {
        return _factory.WithWebHostBuilder(b => b
            .UseSetting("Security:ApiKey", Secret)
            .UseSetting("Hermes:Endpoint", HermesStub)
            .UseSetting("Hermes:ApiKey", HermesAdminKey)
            .UseSetting("LLM:Endpoint", LlmDirectStub)
            .UseSetting("LLM:ApiKey", LlmDirectKey)
            .ConfigureServices(services =>
            {
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(rec);
            }));
    }

    private static StringContent ChatBody(bool useHermesBridge = true)
    {
        var bridge = useHermesBridge ? "true" : "false";
        var json = "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"useHermesBridge\":" + bridge + "}";
        return new(json, Encoding.UTF8, "application/json");
    }

    [Fact]
    public async Task Guest_ChatStream_ForcedToDirect_AndNeverHitsHermesGateway()
    {
        var rec = new RecordingHttpClientFactory();
        var factory = WithRecordingTransport(rec);
        var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream")
        {
            Content = ChatBody(useHermesBridge: true),
        };

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        // Consume the SSE body first (drives the provider call), then assert on the calls.
        await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        // The guest's request must have gone to the direct LLM provider with the LLM key —
        // and never to the Hermes agent gateway with the admin key.
        Assert.NotEmpty(rec.Handler.Calls);
        Assert.All(rec.Handler.Calls, c => Assert.StartsWith(LlmDirectStub, c.Url));
        Assert.DoesNotContain(rec.Handler.Calls, c => c.Url.StartsWith(HermesStub, StringComparison.Ordinal));
        Assert.All(rec.Handler.Calls, c => Assert.Contains(LlmDirectKey, c.Auth ?? string.Empty));
        Assert.DoesNotContain(rec.Handler.Calls, c => (c.Auth ?? string.Empty).Contains(HermesAdminKey, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Admin_ChatStream_CanStillUseHermesGateway()
    {
        var rec = new RecordingHttpClientFactory();
        var factory = WithRecordingTransport(rec);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", Secret);

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream")
        {
            Content = ChatBody(useHermesBridge: true),
        };

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        // Consume the SSE body first: the provider call happens lazily as the stream is
        // read, so the recording handler is only populated once the body has been consumed.
        await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(rec.Handler.Calls, c => c.Url.StartsWith(HermesStub, StringComparison.Ordinal));
        Assert.Contains(rec.Handler.Calls, c => (c.Auth ?? string.Empty).Contains(HermesAdminKey, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Guest_Conversations_Returns401()
    {
        var factory = WithRecordingTransport(new RecordingHttpClientFactory());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/conversations");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Guest_ChatStream_DoesNotReturn401()
    {
        var factory = WithRecordingTransport(new RecordingHttpClientFactory());
        var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream")
        {
            Content = ChatBody(useHermesBridge: true),
        };

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>Records every outbound provider call the backend makes.</summary>
    public sealed class RecordingHttpClientFactory : IHttpClientFactory
    {
        public RecordingHandler Handler { get; } = new();

        public HttpClient CreateClient(string name) =>
            new(Handler) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public sealed class RecordingHandler : HttpMessageHandler
    {
        public List<(string Url, string? Auth)> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add((request.RequestUri!.ToString(), request.Headers.Authorization?.ToString()));
            var sse = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n";
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(sse, Encoding.UTF8, "text/event-stream"),
            };
            return Task.FromResult(response);
        }
    }
}
