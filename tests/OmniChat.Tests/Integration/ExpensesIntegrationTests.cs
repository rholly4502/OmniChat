using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
                    new ExpenseTarget { Month = "2026-10", TargetNabung = 467_000, Anggaran = 520_000, Hari = 4 },
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
            // Partial-month target declares its active-day count; the API must expose it
            // so the frontend chart can prorate its daily-budget reference line.
            Assert.Equal(4, root.GetProperty("hari").GetInt32());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Summary_excludesNabungSavingsFromBudget()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Nabung",
                            Keterangan = "setoran", Nominal = 300_000, SourceId = "a1b2c4" },
                    ], CancellationToken.None);
                await repository.UpsertTargetAsync(
                    new ExpenseTarget { Month = "2026-10", TargetNabung = 467_000, Anggaran = 520_000 },
                    CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/summary?month=2026-10");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            // Spend total excludes the 300k Nabung deposit (savings are not spending).
            Assert.Equal(20_000, root.GetProperty("total").GetInt64());
            Assert.Equal(300_000, root.GetProperty("perKategori").GetProperty("Nabung").GetInt64());
            Assert.Equal(500_000, root.GetProperty("sisaAnggaran").GetInt64());
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

    [Fact]
    public async Task Export_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses/export?month=2026-10");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Export_withApiKey_returnsCsvReport()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
                            Keterangan = "Belanja, grosir", Nominal = 300_000, SourceId = "a1b2e5" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
                    ], CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/export?month=2026-10");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
            Assert.Contains("utf-8", response.Content.Headers.ContentType?.ToString() ?? "");
            Assert.Contains("attachment", response.Content.Headers.ContentDisposition?.DispositionType ?? "");
            Assert.Contains("expenses-2026-10.csv", response.Content.Headers.ContentDisposition?.FileName ?? "");

            var body = await response.Content.ReadAsStringAsync();
            Assert.StartsWith("tanggal,waktu,kategori,keterangan,nominal", body.TrimStart('﻿'));
            // Chronological order: 28th row before 29th row.
            Assert.Contains("2026-10-28,12:30,Makan,Warteg,20000", body);
            // Commas inside a field are quoted per RFC 4180.
            Assert.Contains("2026-10-29,09:10,Belanja,\"Belanja, grosir\",300000", body);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Export_invalidMonth_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.GetAsync("/api/expenses/export?month=not-a-month");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Export_withCategoryAndSearchFilter_returnsOnlyMatchingRows()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
                            Keterangan = "Belanja, grosir", Nominal = 300_000, SourceId = "a1b2e5" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 27), Waktu = "07:00", Kategori = "Makan",
                            Keterangan = "Roti bakar", Nominal = 15_000, SourceId = "a1b2d4" },
                    ], CancellationToken.None);
            });

            // Category filter narrows to Makan; the search still applies within it.
            var response = await client.GetAsync("/api/expenses/export?month=2026-10&kategori=Makan&q=warteg");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("2026-10-28,12:30,Makan,Warteg,20000", body);
            Assert.DoesNotContain("Roti bakar", body);
            Assert.DoesNotContain("Belanja", body);

            // Search-only filter over tanggal matches the 29th Belanja row.
            var byDate = await client.GetAsync("/api/expenses/export?month=2026-10&q=2026-10-29");
            var dateBody = await byDate.Content.ReadAsStringAsync();
            Assert.Contains("Belanja", dateBody);
            Assert.DoesNotContain("Warteg", dateBody);

            // A no-match search yields only the CSV header row.
            var none = await client.GetAsync("/api/expenses/export?month=2026-10&q=tidakada");
            var noneBody = await none.Content.ReadAsStringAsync();
            Assert.StartsWith("tanggal,waktu,kategori,keterangan,nominal", noneBody.TrimStart('﻿'));
            Assert.Equal(2, noneBody.TrimStart('﻿').Split('\n').Length);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task ExportPdf_withCategoryFilter_excludesOtherRows()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
                            Keterangan = "Grosir", Nominal = 300_000, SourceId = "a1b2e5" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
                    ], CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/export/pdf?month=2026-10&kategori=Makan");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var bytes = await response.Content.ReadAsByteArrayAsync();
            var text = System.Text.Encoding.ASCII.GetString(bytes);
            Assert.Contains("Warteg", text);
            Assert.DoesNotContain("Grosir", text);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task ExportPdf_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses/export/pdf?month=2026-10");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task ExportPdf_withApiKey_returnsPdfReport()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
                            Keterangan = "Belanja, grosir", Nominal = 300_000, SourceId = "a1b2e5" },
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
                            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
                    ], CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/export/pdf?month=2026-10");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
            Assert.Contains("attachment", response.Content.Headers.ContentDisposition?.DispositionType ?? "");
            Assert.Contains("expenses-2026-10.pdf", response.Content.Headers.ContentDisposition?.FileName ?? "");

            var bytes = await response.Content.ReadAsByteArrayAsync();
            // PDF magic header + EOF marker.
            Assert.StartsWith("%PDF-1.4", System.Text.Encoding.ASCII.GetString(bytes[..9]));
            Assert.Contains("%%EOF", System.Text.Encoding.ASCII.GetString(bytes));
            // Referenced text (escaped for PDF literal) appears in the content stream.
            var text = System.Text.Encoding.ASCII.GetString(bytes);
            Assert.Contains("2026-10-28", text);
            Assert.Contains("Warteg", text);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task ExportPdf_invalidMonth_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.GetAsync("/api/expenses/export/pdf?month=not-a-month");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Trend_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses/trend?months=3");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Trend_withApiKey_returnsChronologicalPoints()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());

            var now = DateTime.UtcNow.AddHours(7); // WIB (UTC+7), matching the endpoint's today
            var cur = new DateOnly(now.Year, now.Month, 1);
            var prev2 = cur.AddMonths(-2);
            var prev1 = cur.AddMonths(-1);

            await SeedAsync(factory, async repository =>
            {
                await repository.InsertMissingExpensesAsync(
                    [
                        new Expense { Tanggal = cur.AddDays(2), Waktu = "12:00", Kategori = "Makan",
                            Keterangan = "cur", Nominal = 30_000, SourceId = "trend-cur" },
                        // Savings deposits must NOT count toward the spend trend (same
                        // rule as the summary card); the current-month point stays 30k.
                        new Expense { Tanggal = cur.AddDays(3), Waktu = "19:00", Kategori = "Nabung",
                            Keterangan = "save", Nominal = 300_000, SourceId = "trend-save" },
                        new Expense { Tanggal = prev2.AddDays(4), Waktu = "09:00", Kategori = "Transport",
                            Keterangan = "prev2", Nominal = 20_000, SourceId = "trend-prev2" },
                    ], CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/trend?months=3");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            var points = root.GetProperty("points");
            Assert.Equal(3, points.GetArrayLength());
            Assert.Equal(prev2.ToString("yyyy-MM"), points[0].GetProperty("month").GetString());
            Assert.Equal(20_000, points[0].GetProperty("total").GetInt64());
            var cat0 = points[0].GetProperty("categories");
            Assert.Equal(1, cat0.GetArrayLength());
            Assert.Equal("Transport", cat0[0].GetProperty("kategori").GetString());
            Assert.Equal(20_000, cat0[0].GetProperty("total").GetInt64());
            Assert.Equal(prev1.ToString("yyyy-MM"), points[1].GetProperty("month").GetString());
            Assert.Equal(0, points[1].GetProperty("total").GetInt64());
            Assert.Equal(0, points[1].GetProperty("categories").GetArrayLength());
            Assert.Equal(cur.ToString("yyyy-MM"), points[2].GetProperty("month").GetString());
            Assert.Equal(30_000, points[2].GetProperty("total").GetInt64());
            var cat2 = points[2].GetProperty("categories");
            Assert.Equal(1, cat2.GetArrayLength());
            Assert.Equal("Makan", cat2[0].GetProperty("kategori").GetString());
            Assert.Equal(30_000, cat2[0].GetProperty("total").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Trend_invalidMonths_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.GetAsync("/api/expenses/trend?months=0");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }
    [Fact]
    public async Task Advice_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.GetAsync("/api/expenses/advice?date=2026-10-28");

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Advice_withApiKey_returnsAdvice()
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
                        new Expense { Tanggal = new DateOnly(2026, 10, 28), Waktu = "20:00", Kategori = "Belanja",
                            Keterangan = "Sembako", Nominal = 300_000, SourceId = "a1b2c4" },
                    ], CancellationToken.None);
                await repository.UpsertTargetAsync(
                    new ExpenseTarget { Month = "2026-10", TargetNabung = 467_000, Anggaran = 520_000 },
                    CancellationToken.None);
            });

            var response = await client.GetAsync("/api/expenses/advice?date=2026-10-28");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            Assert.Equal("2026-10-28", root.GetProperty("date").GetString());
            Assert.Equal("2026-10", root.GetProperty("month").GetString());
            // 320000 spent on the 28th » 16774 daily budget → over.
            Assert.Equal("over_budget", root.GetProperty("status").GetString());
            Assert.Equal(320_000, root.GetProperty("dayTotal").GetInt64());
            Assert.True(root.GetProperty("suggestions").GetArrayLength() > 0);
            Assert.True(root.GetProperty("categoryTrend").GetArrayLength() >= 2);
            Assert.Equal("Belanja", root.GetProperty("categoryTrend")[0].GetProperty("kategori").GetString());
            Assert.Equal(520_000, root.GetProperty("projection").GetProperty("anggaran").GetInt64());
            Assert.Equal("VGA", root.GetProperty("pcGoal").GetProperty("parts")[0].GetProperty("name").GetString());
            Assert.Equal(8_700_000, root.GetProperty("pcGoal").GetProperty("totalNeeded").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Advice_invalidDate_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.GetAsync("/api/expenses/advice?date=not-a-date");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Create_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "Makan",
                keterangan = "Sarapan", nominal = 20_000,
            });

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Create_withApiKey_persistsNewRow()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());

            var response = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "Makan",
                keterangan = "Sarapan", nominal = 20_000,
            });

            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = json.RootElement;
            Assert.True(root.GetProperty("id").GetInt64() > 0);
            Assert.Equal("Makan", root.GetProperty("kategori").GetString());
            Assert.Equal(20_000, root.GetProperty("nominal").GetInt64());

            // Verify it is listable.
            var list = await client.GetAsync("/api/expenses?month=2026-11&pageSize=50");
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            using var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert.Equal(1, listJson.RootElement.GetProperty("total").GetInt32());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Create_invalidPayload_returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));

            // Bad category.
            var badCategory = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "BukanKategori",
                keterangan = "x", nominal = 10_000,
            });
            Assert.Equal(HttpStatusCode.BadRequest, badCategory.StatusCode);

            // Negative nominal.
            var badNominal = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "Makan",
                keterangan = "x", nominal = -5,
            });
            Assert.Equal(HttpStatusCode.BadRequest, badNominal.StatusCode);

            // Bad date.
            var badDate = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "not-a-date", waktu = "10:00", kategori = "Makan",
                keterangan = "x", nominal = 10_000,
            });
            Assert.Equal(HttpStatusCode.BadRequest, badDate.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Update_withApiKey_changesRow()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());

            var created = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "Makan",
                keterangan = "Sarapan", nominal = 20_000,
            });
            using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();

            var update = await client.PutAsJsonAsync($"/api/expenses/{id}", new
            {
                tanggal = "2026-11-02", waktu = "11:00", kategori = "Transport",
                keterangan = "Gojek", nominal = 15_000,
            });

            Assert.Equal(HttpStatusCode.OK, update.StatusCode);
            using var updateJson = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
            Assert.Equal("Transport", updateJson.RootElement.GetProperty("kategori").GetString());
            Assert.Equal(15_000, updateJson.RootElement.GetProperty("nominal").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Update_missingRow_returns404()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.PutAsJsonAsync("/api/expenses/9999", new
            {
                tanggal = "2026-11-02", waktu = "11:00", kategori = "Lain",
                keterangan = "x", nominal = 5_000,
            });

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Delete_withApiKey_removesRow()
    {
        var db = TempDb();
        try
        {
            var factory = _factory.WithWebHostBuilder(b => b
                .UseSetting("Security:ApiKey", Secret)
                .UseSetting("Persistence:ConnectionString", $"Data Source={db}"));
            var client = Authorized(factory.CreateClient());

            var created = await client.PostAsJsonAsync("/api/expenses", new
            {
                tanggal = "2026-11-01", waktu = "10:00", kategori = "Makan",
                keterangan = "Sarapan", nominal = 20_000,
            });
            using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();

            var del = await client.DeleteAsync($"/api/expenses/{id}");
            Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

            var list = await client.GetAsync("/api/expenses?month=2026-11&pageSize=50");
            using var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert.Equal(0, listJson.RootElement.GetProperty("total").GetInt32());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Delete_missingRow_returns404()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.DeleteAsync("/api/expenses/9999");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

}
