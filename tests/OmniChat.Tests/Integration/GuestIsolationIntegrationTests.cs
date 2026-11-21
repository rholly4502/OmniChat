using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OmniChat.Application.Interfaces;

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

    private WebApplicationFactory<Program> WithIsolatedPersistence(RecordingHttpClientFactory rec, string dbPath)
    {
        return _factory.WithWebHostBuilder(b => b
            .UseSetting("Security:ApiKey", Secret)
            .UseSetting("Hermes:Endpoint", HermesStub)
            .UseSetting("Hermes:ApiKey", HermesAdminKey)
            .UseSetting("LLM:Endpoint", LlmDirectStub)
            .UseSetting("LLM:ApiKey", LlmDirectKey)
            .UseSetting("Persistence:ConnectionString", $"Data Source={dbPath}")
            .ConfigureServices(services =>
            {
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(rec);
            }));
    }

    private static string TempDb() => Path.Combine(Path.GetTempPath(), $"guest-isolation-{Guid.NewGuid():N}.db");

    private static void CleanupDb(string dbPath)
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { dbPath, $"{dbPath}-wal", $"{dbPath}-shm" })
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
    }

    private static StringContent ChatBody(bool useHermesBridge = true)
    {
        var bridge = useHermesBridge ? "true" : "false";
        var json = "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"useHermesBridge\":" + bridge + "}";
        return new(json, Encoding.UTF8, "application/json");
    }

    [Fact]
    public async Task Guest_ChatStream_DoesNotPolluteAdminHistoryOrUsage_AndFilesAuditRowUnderGuest()
    {
        var dbPath = TempDb();
        var rec = new RecordingHttpClientFactory();
        rec.Handler.EmitUsage = true;

        try
        {
            using var factory = WithIsolatedPersistence(rec, dbPath);
            using var guestClient = factory.CreateClient();
            using var adminClient = factory.CreateClient();
            adminClient.DefaultRequestHeaders.Add("X-Api-Key", Secret);

            var guestRequest = new HttpRequestMessage(HttpMethod.Post, "/api/chat/stream")
            {
                Content = ChatBody(useHermesBridge: true),
            };
            using var guestResponse = await guestClient.SendAsync(guestRequest, HttpCompletionOption.ResponseHeadersRead);
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await guestResponse.Content.ReadAsStringAsync(cts.Token);
            Assert.Equal(HttpStatusCode.OK, guestResponse.StatusCode);

            using var listResponse = await adminClient.GetAsync("/api/conversations");
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            using var listJson = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
            Assert.Equal(0, listJson.RootElement.GetArrayLength());

            using var usageResponse = await adminClient.GetAsync("/api/conversations/usage");
            Assert.Equal(HttpStatusCode.OK, usageResponse.StatusCode);
            using var usageJson = JsonDocument.Parse(await usageResponse.Content.ReadAsStringAsync());
            Assert.Equal(0, usageJson.RootElement.GetProperty("conversationCount").GetInt32());
            Assert.Equal(0, usageJson.RootElement.GetProperty("totalTokens").GetInt32());

            using var scope = factory.Services.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IChatHistoryRepository>();
            var guestConversations = await repo.ListConversationsAsync(IChatIdentity.GuestUserId);
            var stored = Assert.Single(guestConversations);
            Assert.Equal(IChatIdentity.GuestUserId, stored.UserId);
            Assert.Equal("direct", stored.Mode);
            Assert.Equal(17, stored.PromptTokens + stored.CompletionTokens);
        }
        finally
        {
            CleanupDb(dbPath);
        }
    }

    [Fact]
    public async Task Guest_ChatStream_WithAdminConversationId_CannotAppendOrRewindAdminConversation()
    {
        var dbPath = TempDb();
        var rec = new RecordingHttpClientFactory();

        try
        {
            using var factory = WithIsolatedPersistence(rec, dbPath);
            using var adminClient = factory.CreateClient();
            adminClient.DefaultRequestHeaders.Add("X-Api-Key", Secret);
            using var guestClient = factory.CreateClient();

            using var adminStreamResponse = await adminClient.PostAsync(
                "/api/chat/stream",
                new StringContent(
                    """{"model":"admin-model","messages":[{"role":"user","content":"admin-secret-prompt"}],"useHermesBridge":true}""",
                    Encoding.UTF8,
                    "application/json"));
            using var adminCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await adminStreamResponse.Content.ReadAsStringAsync(adminCts.Token);
            Assert.Equal(HttpStatusCode.OK, adminStreamResponse.StatusCode);

            using var listResponse = await adminClient.GetAsync("/api/conversations");
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            using var listJson = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
            var adminConversationId = listJson.RootElement[0].GetProperty("id").GetGuid();

            using var detailBeforeResponse = await adminClient.GetAsync($"/api/conversations/{adminConversationId}");
            Assert.Equal(HttpStatusCode.OK, detailBeforeResponse.StatusCode);
            using var detailBeforeJson = JsonDocument.Parse(await detailBeforeResponse.Content.ReadAsStringAsync());
            var userMessageId = detailBeforeJson.RootElement.GetProperty("messages")[0].GetProperty("id").GetGuid();

            // 1. Attempt to append a message and hijack the conversation model.
            var appendBody = JsonSerializer.Serialize(new
            {
                model = "hijacked-model",
                useHermesBridge = false,
                conversationId = adminConversationId,
                messages = new[] { new { role = "user", content = "guest-append" } },
            });
            using (var r1 = await guestClient.PostAsync("/api/chat/stream", new StringContent(appendBody, Encoding.UTF8, "application/json")))
            {
                using var cts1 = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                await r1.Content.ReadAsStringAsync(cts1.Token);
                Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
            }

            // 2. Attempt to drop the trailing assistant reply via regenerate rewind.
            var regenBody = JsonSerializer.Serialize(new
            {
                model = "hijacked-model",
                useHermesBridge = false,
                conversationId = adminConversationId,
                messages = new[] { new { role = "user", content = "admin-secret-prompt" } },
                rewind = new { type = "regenerate" },
            });
            using (var r2 = await guestClient.PostAsync("/api/chat/stream", new StringContent(regenBody, Encoding.UTF8, "application/json")))
            {
                using var cts2 = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                await r2.Content.ReadAsStringAsync(cts2.Token);
                Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
            }

            // 3. Attempt to rewrite the operator's prompt via edit rewind.
            var editBody = JsonSerializer.Serialize(new
            {
                model = "hijacked-model",
                useHermesBridge = false,
                conversationId = adminConversationId,
                messages = new[] { new { role = "user", content = "guest-tampered" } },
                rewind = new { type = "edit", messageId = userMessageId, content = "guest-tampered" },
            });
            using (var r3 = await guestClient.PostAsync("/api/chat/stream", new StringContent(editBody, Encoding.UTF8, "application/json")))
            {
                using var cts3 = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                await r3.Content.ReadAsStringAsync(cts3.Token);
                Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
            }

            using var detailAfterResponse = await adminClient.GetAsync($"/api/conversations/{adminConversationId}");
            Assert.Equal(HttpStatusCode.OK, detailAfterResponse.StatusCode);
            using var detailAfterJson = JsonDocument.Parse(await detailAfterResponse.Content.ReadAsStringAsync());
            Assert.Equal("admin-model", detailAfterJson.RootElement.GetProperty("model").GetString());
            var messages = detailAfterJson.RootElement.GetProperty("messages");
            Assert.Equal(2, messages.GetArrayLength());
            Assert.Equal("admin-secret-prompt", messages[0].GetProperty("content").GetString());
            Assert.Equal("hi", messages[1].GetProperty("content").GetString());
        }
        finally
        {
            CleanupDb(dbPath);
        }
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
        // Hard timeout guards against a stream that never terminates.
        using var cts1 = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await response.Content.ReadAsStringAsync(cts1.Token);

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
        using var cts2 = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await response.Content.ReadAsStringAsync(cts2.Token);

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

    [Fact]
    public async Task Guest_UsageSummary_Returns401()
    {
        var factory = WithRecordingTransport(new RecordingHttpClientFactory());
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/conversations/usage");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
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
        public bool EmitUsage { get; set; }

        public List<(string Url, string? Auth)> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add((request.RequestUri!.ToString(), request.Headers.Authorization?.ToString()));
            var sse = EmitUsage
                ? "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":5}}\n\ndata: [DONE]\n\n"
                : "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n";
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(sse, Encoding.UTF8, "text/event-stream"),
            };
            return Task.FromResult(response);
        }
    }
}
