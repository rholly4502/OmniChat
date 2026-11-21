using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

public class LamaranDraftServiceTests
{
    private const string HermesEndpoint = "http://localhost:5000/v1/chat/completions";

    private sealed class TestableHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

        public TestableHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
            => _handler = (req, _) => Task.FromResult(handler(req));

        public TestableHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
            => _handler = handler;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => _handler(request, cancellationToken);
    }

    private static OpportunityRepository CreateRepoWithOpportunity(out long id)
    {
        var options = new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        var db = new ChatDbContext(options);
        db.Database.OpenConnection();
        db.Database.EnsureCreated();
        var opp = new Opportunity
        {
            Judul = ".NET Developer",
            Perusahaan = "PT Contoh",
            Lokasi = "Remote",
            Tipe = "Kontrak",
            Gaji = "IDR 15-25 jt",
            Catatan = "Remote untuk Indonesia",
            Link = "https://example.com/job",
            Status = "new",
            Ditemukan = new DateOnly(2026, 11, 5),
            SourceId = "s-1",
        };
        db.Opportunities.Add(opp);
        db.SaveChanges();
        id = opp.Id;
        return new OpportunityRepository(db);
    }

    private static LamaranDraftService CreateService(
        OpportunityRepository repo,
        Func<HttpRequestMessage, HttpResponseMessage> handler,
        string? apiKey = null,
        int draftTimeoutSeconds = HermesOptions.DefaultDraftTimeoutSeconds)
    {
        var httpFactory = new Mock<IHttpClientFactory>();
        httpFactory
            .Setup(f => f.CreateClient("LLMClient"))
            .Returns(new HttpClient(new TestableHttpMessageHandler(handler)) { Timeout = Timeout.InfiniteTimeSpan });

        return new LamaranDraftService(
            repo,
            httpFactory.Object,
            Options.Create(new HermesOptions
            {
                Endpoint = HermesEndpoint,
                ApiKey = apiKey,
                DraftTimeoutSeconds = draftTimeoutSeconds,
            }),
            NullLogger<LamaranDraftService>.Instance);
    }

    private static LamaranDraftService CreateAsyncService(
        OpportunityRepository repo,
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler,
        int draftTimeoutSeconds = HermesOptions.DefaultDraftTimeoutSeconds)
    {
        var httpFactory = new Mock<IHttpClientFactory>();
        httpFactory
            .Setup(f => f.CreateClient("LLMClient"))
            .Returns(new HttpClient(new TestableHttpMessageHandler(handler)) { Timeout = Timeout.InfiniteTimeSpan });

        return new LamaranDraftService(
            repo,
            httpFactory.Object,
            Options.Create(new HermesOptions
            {
                Endpoint = HermesEndpoint,
                DraftTimeoutSeconds = draftTimeoutSeconds,
            }),
            NullLogger<LamaranDraftService>.Instance);
    }

    [Fact]
    public async Task Generate_ParsesCoverLetterFromGatewayResponse()
    {
        var repo = CreateRepoWithOpportunity(out var id);
        var service = CreateService(repo, _ =>
        {
            var body = "{\"choices\":[{\"message\":{\"content\":\"Subject: Application for .NET Developer at PT Contoh\\n\\nDear Hiring Manager,\\n\\nI am...\",\"role\":\"assistant\"}}]}";
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var result = await service.GenerateAsync(id, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Contains("Application for .NET Developer", result!.CoverLetter);
    }

    [Fact]
    public async Task Generate_ReturnsNull_WhenOpportunityNotFound()
    {
        var repo = CreateRepoWithOpportunity(out _);
        var service = CreateService(repo, _ =>
            new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("{\"choices\":[{\"message\":{\"content\":\"x\"}}]}", System.Text.Encoding.UTF8, "application/json")
            });

        var result = await service.GenerateAsync(9999, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Generate_Throws_WhenGatewayReturnsError()
    {
        var repo = CreateRepoWithOpportunity(out var id);
        var service = CreateService(repo, _ =>
            new HttpResponseMessage(System.Net.HttpStatusCode.BadGateway));

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GenerateAsync(id, CancellationToken.None));
    }

    [Fact]
    public async Task Generate_SendsBearerAuthHeader_WhenApiKeySet()
    {
        string? authHeader = null;
        var repo = CreateRepoWithOpportunity(out var id);
        var service = CreateService(repo, req =>
        {
            authHeader = req.Headers.Authorization?.ToString();
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("{\"choices\":[{\"message\":{\"content\":\"draft\"}}]}", System.Text.Encoding.UTF8, "application/json")
            };
        }, apiKey: "secret-key");

        await service.GenerateAsync(id, CancellationToken.None);

        Assert.Equal("Bearer secret-key", authHeader);
    }

    [Fact]
    public async Task Generate_SendsLinkedInInCandidateProfile()
    {
        string? body = null;
        var repo = CreateRepoWithOpportunity(out var id);
        var service = CreateService(repo, req =>
        {
            body = req.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("{\"choices\":[{\"message\":{\"content\":\"draft\"}}]}", System.Text.Encoding.UTF8, "application/json")
            };
        });

        await service.GenerateAsync(id, CancellationToken.None);

        Assert.NotNull(body);
        Assert.Contains("linkedin.com/in/rholly-kurnia-putra-462686298", body);
    }

    [Fact]
    public void HermesOptions_DraftTimeout_IsDisabledWhenSecondsAreNonPositive()
    {
        Assert.Equal(90, HermesOptions.DefaultDraftTimeoutSeconds);
        Assert.Equal(TimeSpan.FromSeconds(90), new HermesOptions().DraftTimeout);
        Assert.Null(new HermesOptions { DraftTimeoutSeconds = 0 }.DraftTimeout);
        Assert.Null(new HermesOptions { DraftTimeoutSeconds = -5 }.DraftTimeout);
    }

    [Fact]
    public async Task Generate_ThrowsInvalidOperationException_WhenGatewayTimesOut()
    {
        var repo = CreateRepoWithOpportunity(out var id);
        var service = CreateAsyncService(
            repo,
            async (_, ct) =>
            {
                await Task.Delay(TimeSpan.FromSeconds(10), ct);
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK);
            },
            draftTimeoutSeconds: 1);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.GenerateAsync(id, CancellationToken.None));

        Assert.Contains("tepat waktu", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Generate_PropagatesOperationCanceledException_WhenCallerCancels()
    {
        var repo = CreateRepoWithOpportunity(out var id);
        using var callerCts = new CancellationTokenSource();
        var service = CreateAsyncService(
            repo,
            async (_, ct) =>
            {
                await callerCts.CancelAsync();
                ct.ThrowIfCancellationRequested();
                return await Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK));
            },
            draftTimeoutSeconds: 30);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => service.GenerateAsync(id, callerCts.Token));
    }
}
