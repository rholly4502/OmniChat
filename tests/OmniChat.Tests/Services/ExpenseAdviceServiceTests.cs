using Microsoft.Extensions.Options;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

public sealed class ExpenseAdviceServiceTests
{
    /// <summary>In-memory <see cref="IExpenseRepository"/> double for service unit tests.</summary>
    private sealed class FakeExpenseRepository : IExpenseRepository
    {
        public List<Expense> Rows { get; } = [];
        public ExpenseTarget? Target { get; set; }

        public Task<IReadOnlyList<Expense>> ListAsync(string month, int page, int pageSize, CancellationToken ct) =>
            Task.FromResult((IReadOnlyList<Expense>)Rows.ToList());

        public Task<int> CountAsync(string month, CancellationToken ct) => Task.FromResult(Rows.Count);

        public Task<IReadOnlyList<Expense>> ListAllForMonthAsync(string month, CancellationToken ct) =>
            Task.FromResult((IReadOnlyList<Expense>)Rows.OrderBy(r => r.Tanggal).ToList());

        public Task<(long Total, IReadOnlyDictionary<string, long> PerKategori)> GetTotalsAsync(string month, CancellationToken ct)
        {
            var pk = Rows.GroupBy(r => r.Kategori).ToDictionary(g => g.Key, g => g.Sum(r => r.Nominal));
            return Task.FromResult((pk.Values.Sum(), (IReadOnlyDictionary<string, long>)pk));
        }

        public Task<ExpenseTarget?> GetTargetAsync(string month, CancellationToken ct) => Task.FromResult(Target);

        public Task<int> InsertMissingExpensesAsync(IEnumerable<Expense> expenses, CancellationToken ct)
        {
            Rows.AddRange(expenses);
            return Task.FromResult(expenses.Count());
        }

        public Task UpsertTargetAsync(ExpenseTarget target, CancellationToken ct)
        {
            Target = target;
            return Task.CompletedTask;
        }

        public Task<int> DeleteBySourceIdsAsync(IEnumerable<string> sourceIds, CancellationToken ct) => Task.FromResult(0);

        public Task<IReadOnlyList<(string Month, long Total)>> GetMonthlyTrendAsync(string endMonth, int months, CancellationToken ct) =>
            Task.FromResult((IReadOnlyList<(string, long)>)[]);
    }

    private static ExpenseAdviceService NewService(FakeExpenseRepository repo) =>
        new(repo, Options.Create(new ExpenseAdviceOptions()));

    private static Expense Row(DateOnly d, string kategori, long nominal, string id) =>
        new() { Tanggal = d, Waktu = "12:00", Kategori = kategori, Keterangan = "x", Nominal = nominal, SourceId = id };

    [Fact]
    public async Task OverBudget_whenDaySpendExceedsDailyBudget()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000, TargetNabung = 467_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Makan", 56_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Belanja", 55_000, "b"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        // 520000 / 31 days ≈ 16774 daily budget → 111000 > 16774 → over.
        Assert.Equal("over_budget", advice.Status);
        Assert.Equal(111_000, advice.DayTotal);
        Assert.Equal(16_774, advice.DailyBudget);
        Assert.Equal(94_226, advice.OverBy);
        Assert.NotEmpty(advice.Suggestions);
    }

    [Fact]
    public async Task Oke_whenWithinBudget()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Makan", 15_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        Assert.Equal("oke", advice.Status);
        Assert.Equal(0, advice.OverBy);
        Assert.Empty(advice.Suggestions);
    }

    [Fact]
    public async Task NoTarget_returnsNoTargetStatus()
    {
        var repo = new FakeExpenseRepository(); // no target set
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Makan", 15_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        Assert.Equal("no_target", advice.Status);
        Assert.Empty(advice.Suggestions);
    }

    [Fact]
    public async Task Projection_computesEndOfMonthRunRate()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        // 280000 over 28 days → daily run rate 10000 → projected 31 days ≈ 310000.
        repo.Rows.Add(Row(new DateOnly(2026, 10, 1), "Makan", 10_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Belanja", 270_000, "b"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 28), CancellationToken.None);

        Assert.Equal(280_000, advice.Projection.SpentSoFar);
        Assert.Equal(28, advice.Projection.DaysElapsed);
        Assert.Equal(31, advice.Projection.DaysInMonth);
        Assert.Equal(310_000, advice.Projection.ProjectedTotal);
        Assert.Equal(0, advice.Projection.ProjectedOver);
    }

    [Fact]
    public async Task PcGoal_usesConfiguredDefaultsAndComputesMonths()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        // Tiny spend so projection stays well under budget → positive saving potential.
        repo.Rows.Add(Row(new DateOnly(2026, 10, 1), "Makan", 4_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 1), "Nabung", 1_000_000, "b"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 1), CancellationToken.None);

        var pc = advice.PcGoal;
        Assert.Equal(4, pc.Parts.Count);
        Assert.Equal("VGA", pc.Parts[0].Name);
        Assert.Equal(3_500_000, pc.Parts[0].Price);
        Assert.Equal(8_700_000, pc.TotalNeeded);
        // Nabung so far = 1.000.000 → ~11.5% collected.
        Assert.Equal(1_000_000, pc.NabungSoFar);
        Assert.Equal(7_700_000, pc.Remaining);
        Assert.True(pc.PercentCollected > 11 && pc.PercentCollected < 12);
        // projectedTotal = round(1004000/1*31)=31.124.000 > 520.000 → potential 0 → months null.
        Assert.Equal(0, pc.PotentialSavingPerMonth);
        Assert.Null(pc.MonthsToReach);
    }

    [Fact]
    public async Task CategoryTrend_isSortedDescendingByTotal()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Makan", 30_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Belanja", 100_000, "b"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Makan", 50_000, "c"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 28), CancellationToken.None);

        Assert.Equal("Belanja", advice.CategoryTrend[0].Kategori);
        Assert.Equal(100_000, advice.CategoryTrend[0].Total);
        Assert.Equal("Makan", advice.CategoryTrend[1].Kategori);
        Assert.Equal(80_000, advice.CategoryTrend[1].Total);
    }
}
