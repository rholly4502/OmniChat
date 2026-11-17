using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniChat.Api.Controllers;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Controllers;

public class ExpensesControllerTests
{
    private static (ExpensesController controller, ExpenseRepository repo, string dbPath) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "expenses-ctrl-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        using (var db = new ChatDbContext(options))
        {
            db.Database.EnsureCreated();
        }
        var db2 = new ChatDbContext(options);
        var repo = new ExpenseRepository(db2);
        var advice = new ExpenseAdviceService(repo, Options.Create(new ExpenseAdviceOptions()));
        return (new ExpensesController(repo, advice), repo, dbPath);
    }

    private static T Get<T>(object? o, string name) => (T)o!.GetType().GetProperty(name)!.GetValue(o)!;

    private static Expense Expense(string tanggal, string kategori, long nominal, string? sourceId = null) =>
        new()
        {
            Tanggal = DateOnly.ParseExact(tanggal, "yyyy-MM-dd"),
            Kategori = kategori,
            Keterangan = "catatan",
            Nominal = nominal,
            SourceId = sourceId,
        };

    private static async Task Seed(string dbPath, params Expense[] expenses)
    {
        using var db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite($"Data Source={dbPath}").Options);
        db.Expenses.AddRange(expenses);
        await db.SaveChangesAsync();
    }

    private static async Task SeedIncome(string dbPath, Income income)
    {
        using var db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite($"Data Source={dbPath}").Options);
        db.Incomes.Add(income);
        await db.SaveChangesAsync();
    }

    // ---- List ----

    [Fact]
    public async Task List_ReturnsPagedNewestFirst()
    {
        var (controller, repo, dbPath) = Setup();
        await Seed(dbPath,
            Expense("2026-11-01", "Makan", 10000, "a1"),
            Expense("2026-11-10", "Transport", 20000, "a2"),
            Expense("2026-11-20", "Belanja", 30000, "a3"));

        var result = await controller.List("2026-11", 1, 2, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(3, Get<int>(ok.Value, "total"));
        var items = Get<IReadOnlyList<object>>(ok.Value, "items");
        Assert.Equal(2, items.Count);
        Assert.Equal("2026-11-20", Get<DateOnly>(items[0], "Tanggal").ToString("yyyy-MM-dd"));
        Assert.Equal("2026-11-10", Get<DateOnly>(items[1], "Tanggal").ToString("yyyy-MM-dd"));
    }

    [Fact]
    public async Task List_InvalidMonth_Returns400()
    {
        var (controller, _, _) = Setup();
        var result = await controller.List("2026-13", 1, 50, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Summary ----

    [Fact]
    public async Task Summary_ReturnsTotalsPerKategoriAndSisaAnggaran()
    {
        var (controller, repo, dbPath) = Setup();
        await Seed(dbPath,
            Expense("2026-11-01", "Makan", 10000, "a1"),
            Expense("2026-11-02", "Transport", 5000, "a2"),
            Expense("2026-11-03", "Nabung", 2000, "a3"));
        await repo.UpsertTargetAsync(new ExpenseTarget
        {
            Month = "2026-11",
            Anggaran = 30000,
            TargetNabung = 2000,
        }, CancellationToken.None);

        var result = await controller.Summary("2026-11", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var perKategori = Get<IReadOnlyDictionary<string, long>>(ok.Value, "perKategori");
        Assert.Equal(15000L, Get<long>(ok.Value, "total")); // excludes Nabung
        Assert.Equal(10000L, perKategori["Makan"]);
        Assert.Equal(2000L, perKategori["Nabung"]);
        Assert.Equal(30000L, Get<long>(ok.Value, "anggaran"));
        Assert.Equal(15000L, Get<long>(ok.Value, "sisaAnggaran")); // anggaran - total
        Assert.Equal(2000L, Get<long>(ok.Value, "totalNabungKumulatif")); // cumulative Nabung pot
    }

    [Fact]
    public async Task Summary_TotalNabungIsCumulativeAcrossMonths()
    {
        var (controller, repo, dbPath) = Setup();
        await Seed(dbPath,
            Expense("2026-10-15", "Nabung", 500000, "p1"), // prior month
            Expense("2026-11-01", "Nabung", 200000, "p2"),
            Expense("2026-11-02", "Makan", 10000, "a1"));
        await repo.UpsertTargetAsync(new ExpenseTarget
        {
            Month = "2026-11",
            Anggaran = 30000,
            TargetNabung = 200000,
        }, CancellationToken.None);

        var result = await controller.Summary("2026-11", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        // Pot includes the October deposit too — standing fund toward the PC goal.
        Assert.Equal(700000L, Get<long>(ok.Value, "totalNabungKumulatif"));
    }

    [Fact]
    public async Task Summary_CurrentMonth_ReturnsDailyAverageAndProjection()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var month = today.ToString("yyyy-MM");
        var daysInMonth = DateTime.DaysInMonth(today.Year, today.Month);
        var day = Math.Clamp(today.Day, 1, daysInMonth);

        var (controller, _, dbPath) = Setup();
        await Seed(dbPath, Expense($"{month}-01", "Makan", 30000, "a1"));

        var result = await controller.Summary(month, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);

        Assert.Equal(daysInMonth, Get<int>(ok.Value, "hariBulanIni"));
        Assert.Equal(day, Get<int>(ok.Value, "hariBerjalan"));
        var avg = (long)Math.Round(30000.0 / day);
        Assert.Equal(avg, Get<long>(ok.Value, "rata2Harian"));
        Assert.Equal(avg * daysInMonth, Get<long>(ok.Value, "proyeksiAkhirBulan"));
    }

    [Fact]
    public async Task Summary_NonCurrentMonth_OmitsProjection()
    {
        var (controller, _, dbPath) = Setup();
        await Seed(dbPath, Expense("2020-01-01", "Makan", 30000, "a1"));

        var result = await controller.Summary("2020-01", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);

        Assert.Null(Get<int?>(ok.Value, "hariBulanIni"));
        Assert.Null(Get<int?>(ok.Value, "hariBerjalan"));
        Assert.Null(Get<long?>(ok.Value, "rata2Harian"));
        Assert.Null(Get<long?>(ok.Value, "proyeksiAkhirBulan"));
    }

    [Fact]
    public async Task Summary_InvalidMonth_Returns400()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Summary("bogus", CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Target ----

    [Fact]
    public async Task Target_NoTarget_Returns404()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Target("2026-11", CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Target_HasTarget_Returns200()
    {
        var (controller, repo, _) = Setup();
        await repo.UpsertTargetAsync(new ExpenseTarget
        {
            Month = "2026-11",
            Anggaran = 40000,
            TargetNabung = 5000,
            Catatan = "catatan",
        }, CancellationToken.None);

        var result = await controller.Target("2026-11", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(40000L, Get<long>(ok.Value, "anggaran"));
        Assert.Equal(5000L, Get<long>(ok.Value, "targetNabung"));
    }

    [Fact]
    public async Task UpdateTarget_UpsertsAndPersists()
    {
        var (controller, repo, _) = Setup();
        var request = new ExpensesController.TargetWriteRequest("2026-11", 50000, 8000, "note");

        var result = await controller.UpdateTarget(request, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(50000L, Get<long>(ok.Value, "anggaran"));

        var saved = await repo.GetTargetAsync("2026-11", CancellationToken.None);
        Assert.NotNull(saved);
        Assert.Equal(50000L, saved!.Anggaran);
        Assert.True(saved.IsUserEdited); // web edit must not be overwritten by seeder
    }

    [Fact]
    public async Task UpdateTarget_NegativeAnggaran_Returns400()
    {
        var (controller, _, _) = Setup();
        var request = new ExpensesController.TargetWriteRequest("2026-11", -1, 0, null);
        var result = await controller.UpdateTarget(request, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Sisa ----

    [Fact]
    public async Task Sisa_ComputesCashOnHand()
    {
        var (controller, _, dbPath) = Setup();
        await Seed(dbPath,
            Expense("2026-11-01", "Makan", 100000, "a1"),
            Expense("2026-11-02", "Nabung", 50000, "a2"));
        await SeedIncome(dbPath, new Income { Tanggal = new DateOnly(2026, 11, 1), Nominal = 1_000_000, Keterangan = "Gaji", SourceId = "i1" });

        var result = await controller.Sisa(CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(1_000_000L, Get<long>(ok.Value, "totalPemasukan"));
        Assert.Equal(100_000L, Get<long>(ok.Value, "totalPengeluaran"));
        Assert.Equal(50_000L, Get<long>(ok.Value, "totalNabung"));
        Assert.Equal(900_000L, Get<long>(ok.Value, "sisaUang"));
    }

    // ---- Export ----

    [Fact]
    public async Task ExportCsv_IncludesBomAndRespectsFilters()
    {
        var (controller, _, dbPath) = Setup();
        await Seed(dbPath,
            Expense("2026-11-01", "Makan", 10000, "a1"),
            Expense("2026-11-02", "Transport", 20000, "a2"));

        var result = await controller.Export("2026-11", "Makan", null, CancellationToken.None);
        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("text/csv; charset=utf-8", file.ContentType);
        var text = System.Text.Encoding.UTF8.GetString(file.FileContents);
        Assert.StartsWith("\uFEFF", text); // UTF-8 BOM so Excel renders UTF-8
        Assert.Contains("Makan", text);
        Assert.DoesNotContain("Transport", text);
    }

    [Fact]
    public async Task ExportCsv_InvalidMonth_Returns400()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Export("2026-13", null, null, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    [Fact]
    public async Task ExportPdf_ReturnsPdfBytes()
    {
        var (controller, _, dbPath) = Setup();
        await Seed(dbPath, Expense("2026-11-01", "Makan", 10000, "a1"));

        var result = await controller.ExportPdf("2026-11", null, null, CancellationToken.None);
        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("application/pdf", file.ContentType);
        Assert.True(file.FileContents.Length > 0);
    }

    // ---- Trend ----

    [Fact]
    public async Task Trend_ReturnsZeroFilledPointsEndingThisMonth()
    {
        var (controller, _, dbPath) = Setup();
        var thisMonth = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7)).ToString("yyyy-MM");
        await Seed(dbPath, Expense($"{thisMonth}-05", "Makan", 7000, "a1"));

        var result = await controller.Trend(3, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var points = Get<IReadOnlyList<object>>(ok.Value, "points");
        Assert.Equal(3, points.Count);
        var last = points[2];
        Assert.Equal(thisMonth, Get<string>(last, "Month"));
        Assert.Equal(7000L, Get<long>(last, "Total"));
        Assert.Equal(0L, Get<long>(points[0], "Total")); // zero-filled older months
    }

    [Fact]
    public async Task Trend_InvalidMonths_Returns400()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Trend(0, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Advice ----

    [Fact]
    public async Task Advice_ValidDate_ReturnsOk()
    {
        var (controller, _, dbPath) = Setup();
        await Seed(dbPath, Expense("2026-11-05", "Makan", 10000, "a1"));

        var result = await controller.Advice("2026-11-05", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var advice = Assert.IsType<ExpenseAdvice>(ok.Value);
        Assert.NotNull(advice);
    }

    [Fact]
    public async Task Advice_InvalidDate_Returns400()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Advice("2026-13-99", CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Create ----

    [Fact]
    public async Task Create_ReturnsCreatedPersistsWithWebSourceId()
    {
        var (controller, repo, _) = Setup();
        var request = new ExpensesController.ExpenseWriteRequest("2026-11-05", "12:00", "Makan", "nasi padang", 25000);

        var result = await controller.Create(request, CancellationToken.None);
        var created = Assert.IsType<CreatedAtActionResult>(result);
        Assert.NotNull(created.Value);
        var id = Get<long>(created.Value, "Id");
        Assert.True(id > 0);
        Assert.Equal(25000L, Get<long>(created.Value, "Nominal"));
        Assert.StartsWith("web-", (await repo.GetByIdAsync(id, CancellationToken.None))!.SourceId);
    }

    [Fact]
    public async Task Create_InvalidCategory_Returns400()
    {
        var (controller, _, _) = Setup();
        var request = new ExpensesController.ExpenseWriteRequest("2026-11-05", null, "TidakAda", "x", 1000);
        var result = await controller.Create(request, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    [Fact]
    public async Task Create_NegativeNominal_Returns400()
    {
        var (controller, _, _) = Setup();
        var request = new ExpensesController.ExpenseWriteRequest("2026-11-05", null, "Makan", "x", -1);
        var result = await controller.Create(request, CancellationToken.None);
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    // ---- Update ----

    [Fact]
    public async Task Update_UpdatesExisting_Returns200()
    {
        var (controller, repo, dbPath) = Setup();
        await Seed(dbPath, Expense("2026-11-01", "Makan", 10000, "a1"));
        var seeded = (await repo.ListAllForMonthAsync("2026-11", CancellationToken.None)).Single();

        var request = new ExpensesController.ExpenseWriteRequest("2026-11-02", "09:00", "Transport", "ojol", 20000);
        var result = await controller.Update(seeded.Id, request, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(20000L, Get<long>(ok.Value, "Nominal"));
        Assert.Equal("Transport", Get<string>(ok.Value, "Kategori"));
    }

    [Fact]
    public async Task Update_MissingRow_Returns404()
    {
        var (controller, _, _) = Setup();
        var request = new ExpensesController.ExpenseWriteRequest("2026-11-02", null, "Makan", "x", 1000);
        var result = await controller.Update(99999, request, CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ---- Delete ----

    [Fact]
    public async Task Delete_DeletesAndRecordsTombstone()
    {
        var (controller, repo, dbPath) = Setup();
        await Seed(dbPath, Expense("2026-11-01", "Makan", 10000, "a1"));
        var seeded = (await repo.ListAllForMonthAsync("2026-11", CancellationToken.None)).Single();

        var result = await controller.Delete(seeded.Id, CancellationToken.None);
        Assert.IsType<NoContentResult>(result);

        Assert.Null(await repo.GetByIdAsync(seeded.Id, CancellationToken.None));

        // Deleting again -> 404 (already gone).
        var second = await controller.Delete(seeded.Id, CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(second);
    }

    [Fact]
    public async Task Delete_MissingRow_Returns404()
    {
        var (controller, _, _) = Setup();
        var result = await controller.Delete(99999, CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
    }
}
