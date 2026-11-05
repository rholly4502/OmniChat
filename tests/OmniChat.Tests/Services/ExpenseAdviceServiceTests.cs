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

        public Task<long> GetCumulativeNabungAsync(string month, CancellationToken ct)
        {
            var (_, toExclusive) = MonthRangeForTests(month);
            return Task.FromResult(Rows
                .Where(r => r.Kategori == "Nabung" && r.Tanggal < toExclusive)
                .Sum(r => r.Nominal));
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

        public Task<Expense?> GetByIdAsync(long id, CancellationToken ct) =>
            Task.FromResult(Rows.FirstOrDefault(r => r.Id == id));

        public Task<Expense> AddAsync(Expense expense, CancellationToken ct)
        {
            expense.Id = Rows.Count + 1;
            Rows.Add(expense);
            return Task.FromResult(expense);
        }

        public Task<bool> UpdateAsync(Expense expense, CancellationToken ct)
        {
            var row = Rows.FirstOrDefault(r => r.Id == expense.Id);
            if (row is null) return Task.FromResult(false);
            row.Tanggal = expense.Tanggal;
            row.Waktu = expense.Waktu;
            row.Kategori = expense.Kategori;
            row.Keterangan = expense.Keterangan;
            row.Nominal = expense.Nominal;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(long id, CancellationToken ct)
        {
            var removed = Rows.RemoveAll(r => r.Id == id);
            return Task.FromResult(removed > 0);
        }

        public Task<long> GetTotalPemasukanAsync(CancellationToken ct) => Task.FromResult(0L);

        public Task<long> GetTotalPengeluaranAllAsync(CancellationToken ct) => Task.FromResult(0L);

        public Task<int> InsertMissingIncomesAsync(IEnumerable<Income> incomes, CancellationToken ct) =>
            Task.FromResult(0);
    }

    private static (DateOnly From, DateOnly ToExclusive) MonthRangeForTests(string month)
    {
        var parts = month.Split('-').Select(int.Parse).ToArray();
        var from = new DateOnly(parts[0], parts[1], 1);
        var toExclusive = from.AddMonths(1);
        return (from, toExclusive);
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
    public async Task NabungDeposit_doesNotCountAsDaySpend()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        // A savings deposit on the 31st is not spending: day total stays 0 → "oke".
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Nabung", 1_000_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        Assert.Equal(0, advice.DayTotal);
        Assert.Equal("oke", advice.Status);
        Assert.Equal(0, advice.OverBy);
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
        // The 1jt Nabung deposit must NOT count as spending (Nabung = savings), so the
        // projection is based on the 4.000 spend only and saving potential stays positive.
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
        // Projection is computed from the non-Nabung spend (4.000): round(4000/1*31)
        // = 124.000 < 520.000 → potential 396.000/month.
        Assert.Equal(124_000, advice.Projection.ProjectedTotal);
        Assert.Equal(396_000, pc.PotentialSavingPerMonth);
        // Months-to-goal is computed from what is still missing (remaining), not
        // the full 8.7jt total — 7.7jt / 396.000 = 19.44 → ceil 20 months.
        // (Regression guard: the old code divided the full total, reporting 22 and
        // overstating the time left once savings had been collected.)
        Assert.Equal(20, pc.MonthsToReach);
    }

    [Fact]
    public async Task PcGoal_GoalFullyCollectedReportsZeroMonthsLeft()
    {
        // When the collected savings already cover the goal, the remaining is 0,
        // so the months-to-goal must be 0 (not a positive from-scratch horizon).
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        // 8.7jt target is fully collected by a single Nabung deposit (savings, not spend).
        repo.Rows.Add(Row(new DateOnly(2026, 10, 1), "Nabung", 8_700_000, "full"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 1), CancellationToken.None);

        var pc = advice.PcGoal;
        Assert.Equal(8_700_000, pc.TotalNeeded);
        Assert.Equal(8_700_000, pc.NabungSoFar);
        Assert.Equal(0, pc.Remaining);
        Assert.Equal(0, pc.MonthsToReach);
    }

    [Fact]
    public async Task PcGoal_NabungSoFarIsCumulativeAcrossMonths()
    {
        // A savings goal accumulates across months: viewing a later month must count
        // every earlier Nabung deposit, not just that month's. (Regression: the old
        // code read the month-scoped per-category map, so October's 1jt was invisible
        // when viewing November.)
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 520_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 15), "Nabung", 1_000_000, "oct"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 2), "Nabung", 500_000, "nov"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 3), "Makan", 10_000, "makan"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 3), CancellationToken.None);

        var pc = advice.PcGoal;
        Assert.Equal(1_500_000, pc.NabungSoFar);
        Assert.Equal(7_200_000, pc.Remaining);
        Assert.True(pc.PercentCollected > 17 && pc.PercentCollected < 18);
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

    [Fact]
    public async Task CategoryTrend_excludesNabungSavingsFromSpendPattern()
    {
        // Savings (kategori "Nabung") are not spending: even the largest deposit must
        // never appear in the spending-pattern trend (same rule as summary/trend/projection).
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Nabung", 1_000_000, "save"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 28), "Makan", 30_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 28), CancellationToken.None);

        Assert.DoesNotContain(advice.CategoryTrend, c => c.Kategori == "Nabung");
        Assert.Single(advice.CategoryTrend);
        Assert.Equal("Makan", advice.CategoryTrend[0].Kategori);
    }

    [Fact]
    public async Task DailySuggestions_allSectionsPopulated()
    {
        var advice = await NewService(new FakeExpenseRepository())
            .BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        var d = advice.Daily;
        Assert.False(string.IsNullOrWhiteSpace(d.Sarapan));
        Assert.False(string.IsNullOrWhiteSpace(d.MakanSiang));
        Assert.False(string.IsNullOrWhiteSpace(d.MakanMalam));
        Assert.False(string.IsNullOrWhiteSpace(d.Aktivitas));
        Assert.False(string.IsNullOrWhiteSpace(d.FunFact));
        Assert.False(string.IsNullOrWhiteSpace(d.TipAnakKos));
        // The menu is a full three-meal set.
        Assert.NotEqual(d.Sarapan, d.MakanSiang);
        Assert.NotEqual(d.MakanSiang, d.MakanMalam);
    }

    [Fact]
    public async Task DailySuggestions_areDeterministicPerDate()
    {
        var service = NewService(new FakeExpenseRepository());
        var day = new DateOnly(2026, 10, 31);

        var a = await service.BuildAsync(day, CancellationToken.None);
        var b = await service.BuildAsync(day, CancellationToken.None);

        Assert.Equal(a.Daily, b.Daily);
    }

    [Fact]
    public async Task DailySuggestions_rotateAcrossDates()
    {
        var service = NewService(new FakeExpenseRepository());

        var a = await service.BuildAsync(new DateOnly(2026, 10, 1), CancellationToken.None);
        var b = await service.BuildAsync(new DateOnly(2026, 10, 2), CancellationToken.None);

        // Across two consecutive days at least one section must differ (rotation).
        Assert.True(
            a.Daily.Sarapan != b.Daily.Sarapan
            || a.Daily.Aktivitas != b.Daily.Aktivitas
            || a.Daily.FunFact != b.Daily.FunFact
            || a.Daily.TipAnakKos != b.Daily.TipAnakKos);
    }

    [Fact]
    public async Task DailySuggestions_areStableAcrossSameMonthDayInDifferentYears()
    {
        // Determinism is keyed to the absolute day number, not the calendar month,
        // so a date always maps to the same suggestions regardless of context.
        var service = NewService(new FakeExpenseRepository());
        var a = await service.BuildAsync(new DateOnly(2026, 11, 2), CancellationToken.None);
        var b = await service.BuildAsync(new DateOnly(2027, 11, 2), CancellationToken.None);
        Assert.NotEqual(a.Daily, b.Daily);
    }

    [Fact]
    public async Task DailySuggestions_fullWeekIsAllDistinct()
    {
        // P1-6 variety: pool size is 7, so a full week (Mon-Sun) shows seven
        // distinct menus, activities, facts and tips — no repeat for a week.
        var service = NewService(new FakeExpenseRepository());
        var dailies = new List<DailySuggestions>();
        for (var i = 0; i < 7; i++)
        {
            var advice = await service.BuildAsync(new DateOnly(2026, 10, 1 + i), CancellationToken.None);
            dailies.Add(advice.Daily);
        }

        Assert.Equal(7, dailies.Select(d => d.Sarapan).Distinct().Count());
        Assert.Equal(7, dailies.Select(d => d.MakanSiang).Distinct().Count());
        Assert.Equal(7, dailies.Select(d => d.MakanMalam).Distinct().Count());
        Assert.Equal(7, dailies.Select(d => d.Aktivitas).Distinct().Count());
        Assert.Equal(7, dailies.Select(d => d.FunFact).Distinct().Count());
        Assert.Equal(7, dailies.Select(d => d.TipAnakKos).Distinct().Count());
    }

    [Fact]
    public async Task DailySuggestions_expandedPools_AllEntriesAppearAcrossAWindow()
    {
        // P1-6 variety: pools were expanded (menus 14, activities 9, facts 10,
        // tips 12) and decoupled. Over 30 consecutive days every entry of each
        // pool must surface, pinning both the pool sizes and the coprime strides.
        var service = NewService(new FakeExpenseRepository());
        var anchor = new DateOnly(2026, 10, 1);
        var sarapan = new HashSet<string>();
        var aktivitas = new HashSet<string>();
        var facts = new HashSet<string>();
        var tips = new HashSet<string>();
        for (var i = 0; i < 30; i++)
        {
            var d = await service.BuildAsync(anchor.AddDays(i), CancellationToken.None);
            sarapan.Add(d.Daily.Sarapan);
            aktivitas.Add(d.Daily.Aktivitas);
            facts.Add(d.Daily.FunFact);
            tips.Add(d.Daily.TipAnakKos);
        }
        Assert.Equal(14, sarapan.Count);
        Assert.Equal(9, aktivitas.Count);
        Assert.Equal(10, facts.Count);
        Assert.Equal(12, tips.Count);
    }

    [Fact]
    public async Task DailySuggestions_decoupledRotation_MenuRepeatsButActivityChanges()
    {
        // The rotation strides are per-pool, so the menu set cycles on its own 14-day
        // period while activities advance independently — a menu may repeat without a
        // boringly identical card, which is the whole point of "biar gak bosan".
        var service = NewService(new FakeExpenseRepository());
        var day = new DateOnly(2026, 10, 1);
        var a = await service.BuildAsync(day, CancellationToken.None);
        var b = await service.BuildAsync(day.AddDays(14), CancellationToken.None);

        Assert.Equal(a.Daily.Sarapan, b.Daily.Sarapan);        // same menu set (period 14)
        Assert.NotEqual(a.Daily.Aktivitas, b.Daily.Aktivitas); // but a different activity
    }

    [Fact]
    public async Task PartialMonthTarget_usesActiveDaysForDailyBudget()
    {
        // A prorated partial month (e.g. October 2026, only 4 active days) declares its
        // active day count (Hari). Budget 520k over 4 days = 130k/day, so a realistic
        // 56k spend is within budget — NOT falsely over like the old full-31-day split.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-10", Anggaran = 520_000, Hari = 4 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 31), "Makan", 56_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 10, 31), CancellationToken.None);

        Assert.Equal(130_000, advice.DailyBudget);
        Assert.Equal("oke", advice.Status);
        Assert.Equal(0, advice.OverBy);
        Assert.Empty(advice.Suggestions);
    }
}
