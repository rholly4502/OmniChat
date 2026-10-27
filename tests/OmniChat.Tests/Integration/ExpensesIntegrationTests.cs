using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Exercises the Pengeluaran read endpoints over the real HTTP pipeline: admin-only auth
/// (401 without API key) and the list/summary/target behaviour against a real SQLite file.
/// </summary>
public sealed class ExpensesIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Secret = "integration-secret";
    private readonly WebApplicationFactory<Program> _factory;

    public ExpensesIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

    /// <summary>Builds an isolated host with a unique SQLite file and the API key set.</summary>
    private HttpClient NewClient(string dbPath) =>
        _factory.WithWebHostBuilder(b => b
            .UseSetting("Security:ApiKey", Secret)
            .UseSetting("Persistence:ConnectionString", $"Data Source={dbPath}"))
        .CreateClient();

    private static HttpClient Authorized(HttpClient client)
    {
        client.DefaultRequestHeaders.Add("X-Api-Key", Secret);
        return client;
    }

    private static string TempDb() => Path.Combine(Path.GetTempPath(), $"expenses-int-{Guid.NewGuid():N}.db");

    private static async Task SeedAsync(WebApplicationFactory<Program> factory, Func<IExpenseRepository, Task> seed)
    {
        using var scope = factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IExpenseRepository>();
        await seed(repository);
    }

    [Fact]
    public async Task List_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses?month=2026-10");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Summary_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses/summary?month=2026-10");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task List_withApiKey_returnsSeededTransactions()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());
            await SeedAsync(factory, async repository =>
            {
                await repository.InsertMissingExpensesAsync(
                    [
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
                            Keterangan = "Belanja", Nominal = 300_000, SourceId = "a1b2e5" },
                    ], CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses?month=2026-10&page=1&pageSize=50");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            Assert.Equal("2026-10", root.GetProperty("month").GetString());
            Assert.Equal(2, root.GetProperty("total").GetInt32());
            Assert.Equal(2, root.GetProperty("items").GetArrayLength());
            Assert.Equal("Belanja", root.GetProperty("items")[0].GetProperty("keterangan").GetString());
            Assert.Equal("Warteg", root.GetProperty("items")[1].GetProperty("keterangan").GetString());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Summary_withApiKey_returnsTotalsAndTarget()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());
            await SeedAsync(factory, async repository =>
            {
                await repository.InsertMissingExpensesAsync(
                    [
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "a", Nominal = 20_000, SourceId = "a1b2c3" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Makan",
                            Keterangan = "b", Nominal = 10_000, SourceId = "a1b2c4" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 30), Waktu = "19:00", Kategori = "Transport",
                            Keterangan = "c", Nominal = 15_000, SourceId = "a1b2c5" },
                    ], CancellationToken.None);
                await repository.UpsertTargetAsync(
                    new ExpenseTarget { Month = "2026-10", TargetNabung = 467_000, Anggaran = 520_000 },
                    CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/summary?month=2026-10");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            Assert.Equal(45_000, root.GetProperty("total").GetInt64());
            Assert.Equal(30_000, root.GetProperty("perKategori").GetProperty("Makan").GetInt64());
            Assert.Equal(15_000, root.GetProperty("perKategori").GetProperty("Transport").GetInt64());
            Assert.Equal(467_000, root.GetProperty("targetNabung").GetInt64());
            Assert.Equal(520_000, root.GetProperty("anggaran").GetInt64());
            Assert.Equal(475_000, root.GetProperty("sisaAnggaran").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Target_withApiKey_returns404WhenUnset()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());

            var response = await client.GetAsync("/api/expenses/target?month=2026-12");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task List_invalidMonth_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.GetAsync("/api/expenses?month=not-a-month");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }
}
