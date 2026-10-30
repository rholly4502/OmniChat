using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for <see cref="ExpenseRepository"/> against a real in-memory SQLite database,
/// mirroring the setup used for <see cref="ChatHistoryRepositoryTests"/>.
/// </summary>
public sealed class ExpenseRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly ExpenseRepository _repository;

    public ExpenseRepositoryTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options);
        _db.Database.EnsureCreated();
        _repository = new ExpenseRepository(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static Expense NewExpense(
        int day, string kategori = "Makan", long nominal = 20_000, string? sourceId = null) => new()
    {
        Tanggal = new DateOnly(2026, 10, day),
        Waktu = "12:00",
        Kategori = kategori,
        Keterangan = "catatan",
        Nominal = nominal,
        SourceId = sourceId,
    };

    [Fact]
    public async Task List_returns_rows_for_the_requested_month_only()
    {
        await _repository.InsertMissingExpensesAsync(
            [NewExpense(2), NewExpense(28, sourceId: "oct"), new Expense
            {
                Tanggal = new DateOnly(2026, 11, 2),
                Waktu = "08:00",
                Kategori = "Makan",
                Keterangan = "nov",
                Nominal = 10_000,
                SourceId = "nov",
            }], CancellationToken.None);

        var rows = await _repository.ListAsync("2026-10", 1, 50, CancellationToken.None);

        Assert.Equal(2, rows.Count);
        Assert.All(rows, r => Assert.Equal(new DateOnly(2026, 10, r.Tanggal.Day), r.Tanggal));
    }

    [Fact]
    public async Task List_orders_newest_first()
    {
        await _repository.InsertMissingExpensesAsync(
            [NewExpense(2, sourceId: "a"), NewExpense(28, sourceId: "b")], CancellationToken.None);

        var rows = await _repository.ListAsync("2026-10", 1, 50, CancellationToken.None);

        Assert.Equal(28, rows[0].Tanggal.Day);
        Assert.Equal(2, rows[1].Tanggal.Day);
    }

    [Fact]
    public async Task List_respects_page_and_pageSize()
    {
        await _repository.InsertMissingExpensesAsync(
            Enumerable.Range(1, 5).Select(d => NewExpense(d, sourceId: $"s{d}")), CancellationToken.None);

        var page1 = await _repository.ListAsync("2026-10", 1, 2, CancellationToken.None);
        var page2 = await _repository.ListAsync("2026-10", 2, 2, CancellationToken.None);

        Assert.Equal(2, page1.Count);
        Assert.Equal(2, page2.Count);
        Assert.Equal(5, page1[0].Tanggal.Day); // newest first
        Assert.Equal(3, page2[0].Tanggal.Day);
    }

    [Fact]
    public async Task Count_returns_number_of_rows_in_month()
    {
        await _repository.InsertMissingExpensesAsync(
            [NewExpense(2), NewExpense(10), NewExpense(28)], CancellationToken.None);

        Assert.Equal(3, await _repository.CountAsync("2026-10", CancellationToken.None));
        Assert.Equal(0, await _repository.CountAsync("2026-11", CancellationToken.None));
    }

    [Fact]
    public async Task GetTotals_returns_total_and_per_category_breakdown()
    {
        await _repository.InsertMissingExpensesAsync(
            [
                NewExpense(2, "Makan", 10_000),
                NewExpense(3, "Makan", 5_000),
                NewExpense(4, "Transport", 20_000),
            ], CancellationToken.None);

        var (total, perKategori) = await _repository.GetTotalsAsync("2026-10", CancellationToken.None);

        Assert.Equal(35_000, total);
        Assert.Equal(15_000, perKategori["Makan"]);
        Assert.Equal(20_000, perKategori["Transport"]);
    }

    [Fact]
    public async Task GetTarget_returns_null_when_unset()
    {
        var target = await _repository.GetTargetAsync("2026-10", CancellationToken.None);
        Assert.Null(target);
    }

    [Fact]
    public async Task UpsertTarget_creates_then_updates_by_month()
    {
        var target = new ExpenseTarget { Month = "2026-10", TargetNabung = 100, Anggaran = 200, Catatan = "a" };
        await _repository.UpsertTargetAsync(target, CancellationToken.None);

        var fetched = await _repository.GetTargetAsync("2026-10", CancellationToken.None);
        Assert.NotNull(fetched);
        Assert.Equal(100, fetched.TargetNabung);
        Assert.Equal(200, fetched.Anggaran);

        target.TargetNabung = 300;
        target.Anggaran = 400;
        target.Catatan = "b";
        await _repository.UpsertTargetAsync(target, CancellationToken.None);

        var fetch2 = await _repository.GetTargetAsync("2026-10", CancellationToken.None);
        Assert.Equal(300, fetch2!.TargetNabung);
        Assert.Equal(400, fetch2.Anggaran);
        Assert.Equal("b", fetch2.Catatan);
        Assert.Equal(1, _db.ExpenseTargets.Count());
    }

    [Fact]
    public async Task InsertMissing_skips_existing_sourceIds_and_inserts_only_new()
    {
        await _repository.InsertMissingExpensesAsync(
            [NewExpense(1, sourceId: "dup"), NewExpense(2, sourceId: "new")], CancellationToken.None);

        var inserted = await _repository.InsertMissingExpensesAsync(
            [NewExpense(3, sourceId: "dup"), NewExpense(4, sourceId: "new"), NewExpense(5, sourceId: "another")],
            CancellationToken.None);

        Assert.Equal(1, inserted);
        Assert.Equal(3, _db.Expenses.Count());
    }

    [Fact]
    public async Task GetMonthlyTrend_returnsChronologicalZeroFilledPoints()
    {
        await _repository.InsertMissingExpensesAsync(
            [
                NewExpense(2, "Makan", 10_000, "a"),
                NewExpense(3, "Makan", 20_000, "b"),
                new Expense
                {
                    Tanggal = new DateOnly(2026, 8, 15),
                    Waktu = "09:00",
                    Kategori = "Transport",
                    Keterangan = "aug",
                    Nominal = 20_000,
                    SourceId = "c",
                },
            ], CancellationToken.None);

        var trend = await _repository.GetMonthlyTrendAsync("2026-10", 3, CancellationToken.None);

        Assert.Equal(3, trend.Count);
        Assert.Equal(("2026-08", 20_000L), trend[0]);
        Assert.Equal(("2026-09", 0L), trend[1]);
        Assert.Equal(("2026-10", 30_000L), trend[2]);
    }

    [Fact]
    public async Task GetMonthlyTrend_invalidEndMonth_throws()
    {
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            _repository.GetMonthlyTrendAsync("not-a-month", 3, CancellationToken.None));
    }

    [Fact]
    public async Task GetMonthlyTrend_emptyLedger_returnsAllZeros()
    {
        var trend = await _repository.GetMonthlyTrendAsync("2026-10", 3, CancellationToken.None);
        Assert.All(trend, p => Assert.Equal(0L, p.Total));
    }
}
