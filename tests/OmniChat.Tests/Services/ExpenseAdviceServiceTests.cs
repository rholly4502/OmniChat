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
            Task.FromResult((IReadOnlyList<Expense>)Rows
                .Where(r => r.Tanggal.ToString("yyyy-MM") == month)
                .OrderBy(r => r.Tanggal).ToList());

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

        public Task<IReadOnlyList<(string Month, long Total, IReadOnlyDictionary<string, long> ByCategory)>> GetMonthlyTrendAsync(string endMonth, int months, CancellationToken ct) =>
            Task.FromResult((IReadOnlyList<(string, long, IReadOnlyDictionary<string, long>)>)[]);

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
    public async Task TagihanRentDay_doesNotFlagOverBudget()
    {
        // Committed recurring bills (Tagihan, e.g. kos rent) are fixed outlays, not
        // discretionary overspending. On rent-payment day the day spend includes a
        // 1.3jt rent bill; the daily status must still read "oke" when the only
        // discretionary (Makan) spend is within the daily budget, so the panel does
        // not raise a false red alarm with cut-back tips that cannot reduce rent.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Tagihan", 1_300_000, "sewa"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Makan", 20_000, "m"));
        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 1), CancellationToken.None);
        // 3.9jt / 30 = 130k daily budget; day total (discretionary only) = 20k.
        Assert.Equal("oke", advice.Status);
        Assert.Equal(20_000, advice.DayTotal);
        Assert.Equal(0, advice.OverBy);
        Assert.Empty(advice.Suggestions);
    }

    [Fact]
    public async Task OverBudget_stillFlagsWhenDiscretionaryOverspends()
    {
        // Rent being excluded must not mask real discretionary overspending: when the
        // day's non-rent spend exceeds the daily budget, the red over-budget status
        // still fires, with overBy computed from the discretionary overrun.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Tagihan", 1_300_000, "sewa"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Makan", 250_000, "m"));
        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 1), CancellationToken.None);
        Assert.Equal("over_budget", advice.Status);
        Assert.Equal(250_000, advice.DayTotal);
        Assert.Equal(120_000, advice.OverBy); // 250k - 130k
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
    public async Task CategoryTrend_carriesPreviousMonthComparison()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 520_000 },
        };
        // Previous month (October) baseline: Makan 40k, Belanja 50k. The large
        // Nabung deposit must NOT count as spending in the previous-month baseline.
        repo.Rows.Add(Row(new DateOnly(2026, 10, 15), "Makan", 40_000, "p-makan"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 15), "Belanja", 50_000, "p-belanja"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 15), "Nabung", 5_000_000, "p-save"));
        // Current month (November): Makan up, Belanja down, Transport is new this month.
        repo.Rows.Add(Row(new DateOnly(2026, 11, 28), "Makan", 60_000, "makan"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 28), "Belanja", 30_000, "belanja"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 28), "Transport", 20_000, "transport"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 28), CancellationToken.None);

        var makan = Assert.Single(advice.CategoryTrend, c => c.Kategori == "Makan");
        Assert.Equal(60_000, makan.Total);
        Assert.Equal(40_000, makan.PreviousTotal);
        Assert.Equal(20_000, makan.Delta);
        Assert.Equal(50.0, makan.PercentChange);

        var belanja = Assert.Single(advice.CategoryTrend, c => c.Kategori == "Belanja");
        Assert.Equal(30_000, belanja.Total);
        Assert.Equal(50_000, belanja.PreviousTotal);
        Assert.Equal(-20_000, belanja.Delta);
        Assert.Equal(-40.0, belanja.PercentChange);

        // A category absent last month has no percentage baseline (percent = null).
        var transport = Assert.Single(advice.CategoryTrend, c => c.Kategori == "Transport");
        Assert.Equal(20_000, transport.Total);
        Assert.Equal(0, transport.PreviousTotal);
        Assert.Equal(20_000, transport.Delta);
        Assert.Null(transport.PercentChange);

        Assert.DoesNotContain(advice.CategoryTrend, c => c.Kategori == "Nabung");
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
        Assert.False(string.IsNullOrWhiteSpace(d.Biaya));
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

    [Fact]
    public async Task Projection_excludesCommittedTagihanBillsFromRunRate()
    {
        // A lumpy recurring bill (kos rent, Tagihan) paid once early inflates the naive
        // daily run-rate: 1.4jt over 5 days would extrapolate to ~8.4jt. The projection
        // must treat committed bills as a fixed block and only extrapolate the variable
        // discretionary (Makan etc.) rate, so the month lands near 1.9jt.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Tagihan", 1_300_000, "sewa"));
        for (var i = 1; i <= 5; i++)
            repo.Rows.Add(Row(new DateOnly(2026, 11, i), "Makan", 20_000, $"m{i}"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 5), CancellationToken.None);

        // total = 1.4jt; fixed Tagihan = 1.3jt; discretionary 100k/5 = 20k/day -> 600k/mo.
        Assert.Equal(1_900_000, advice.Projection.ProjectedTotal);
        Assert.Equal(0, advice.Projection.ProjectedOver);
    }

    [Fact]
    public async Task DailySuggestions_menuCostEstimatePresentForEveryMenuSet()
    {
        // P1-6 "hemat" intent: every menu set carries a frugal daily-cost estimate so the
        // user can compare a day's plan against the daily budget. Distinct menus may share a
        // realistic cost range, so the invariant is not uniqueness — it is that all 14 menus
        // surface within the window and that each estimate travels deterministically with its
        // menu set (same menu -> same cost).
        var service = NewService(new FakeExpenseRepository());
        var anchor = new DateOnly(2026, 10, 1);
        var byMenu = new Dictionary<string, string>();
        for (var i = 0; i < 30; i++)
        {
            var advice = await service.BuildAsync(anchor.AddDays(i), CancellationToken.None);
            Assert.False(string.IsNullOrWhiteSpace(advice.Daily.Biaya));
            if (byMenu.TryGetValue(advice.Daily.Sarapan, out var known))
                Assert.Equal(known, advice.Daily.Biaya);
            else
                byMenu[advice.Daily.Sarapan] = advice.Daily.Biaya;
        }
        Assert.Equal(14, byMenu.Count); // all 14 menus were visited and carry an estimate
    }

    [Fact]
    public async Task Pace_comparesCumulativeSpendAgainstSameDayLastMonth()
    {
        // Current month Nov (analysed to day 5) vs last month Oct at the same day-of-month.
        // Oct: 10k on day 3, 30k on day 20. Nov: 20k on day 2, 40k on day 6, plus a
        // Nabung deposit on day 3 that must NOT count as spending.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 10, 3), "Makan", 10_000, "oct3"));
        repo.Rows.Add(Row(new DateOnly(2026, 10, 20), "Belanja", 30_000, "oct20"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 2), "Makan", 20_000, "nov2"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 3), "Nabung", 1_000_000, "save"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 6), "Belanja", 40_000, "nov6"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 5), CancellationToken.None);

        var pace = advice.Pace;
        Assert.Equal("2026-11", pace.CurrentMonth);
        Assert.Equal("2026-10", pace.PreviousMonth);
        Assert.Equal(5, pace.Day);
        // Through day 5: Nov has only the day-2 20k (day 6 excluded; Nabung excluded).
        Assert.Equal(20_000, pace.CurrentThroughDay);
        // Through day 5: Oct has only the day-3 10k (day 20 excluded).
        Assert.Equal(10_000, pace.PreviousThroughDay);
        Assert.Equal(10_000, pace.Delta);
        Assert.Equal(100.0, pace.PercentChange);
    }

    [Fact]
    public async Task Pace_noPreviousData_reportsNoBaseline()
    {
        // Only current-month rows exist: compare baseline is empty, so the percent change
        // must be null (not a fabricated 0%) and delta equals the spend through today.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 11, 2), "Makan", 20_000, "nov2"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 5), "Makan", 15_000, "nov5"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 5), CancellationToken.None);

        var pace = advice.Pace;
        Assert.Equal(35_000, pace.CurrentThroughDay);
        Assert.Equal(0, pace.PreviousThroughDay);
        Assert.Equal(35_000, pace.Delta);
        Assert.Null(pace.PercentChange);
    }

    [Fact]
    public async Task DailySuggestions_foodSpend_aggregatesOnlyThatDaysMakan()
    {
        // The daily frugal-menu plan is measured against today's actual food spend. Only
        // rows on the analysed date with kategori "Makan" count; non-food categories and
        // other days must not leak into the comparison.
        var repo = new FakeExpenseRepository();
        var d = new DateOnly(2026, 11, 5);
        repo.Rows.Add(Row(d, "Makan", 30_000, "food1"));
        repo.Rows.Add(Row(d, "Makan", 5_000, "food2"));
        repo.Rows.Add(Row(d, "Transport", 20_000, "transport"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 4), "Makan", 9_999, "other-day"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(35_000, advice.Daily.FoodSpend);
    }

    [Fact]
    public async Task DailySuggestions_planCostRange_isPositiveAndOrderedForEveryMenu()
    {
        // Every menu set must carry a sane frugal cost range (min <= max, both positive) so
        // the UI comparison never divides by zero or flips red for a lower spend.
        var service = NewService(new FakeExpenseRepository());
        var anchor = new DateOnly(2026, 10, 1);
        for (var i = 0; i < 14; i++)
        {
            var advice = await service.BuildAsync(anchor.AddDays(i), CancellationToken.None);
            Assert.True(advice.Daily.BiayaMin > 0, $"BiayaMin <= 0 on day {i}");
            Assert.True(advice.Daily.BiayaMin <= advice.Daily.BiayaMax, $"BiayaMin > BiayaMax on day {i}");
        }
    }

    [Fact]
    public async Task RemainingAllowance_computesPerDayEnvelopeForRestOfMonth()
    {
        // After an early lumpy bill (sewa kos), the static daily budget overstates what is
        // affordable. What matters is what is left divided by the days remaining. A Nabung
        // deposit must not reduce the remaining budget (it is not spending).
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 6);
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Tagihan", 1_300_000, "kos"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Makan", 53_000, "m1"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 2), "Makan", 30_000, "m2"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 3), "Transport", 160_000, "t1"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 4), "Makan", 72_000, "m3"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 5), "Makan", 50_000, "m4"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 6), "Makan", 183_000, "m5"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 6), "Nabung", 200_000, "save"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        // Non-Nabung through day 6 = 1.3M + 53k + 30k + 160k + 72k + 50k + 183k = 1.848M.
        Assert.Equal(1_848_000, advice.RemainingAllowance.SpentSoFar);
        Assert.Equal(2_052_000, advice.RemainingAllowance.RemainingBudget); // 3.9M - 1.848M
        Assert.Equal(24, advice.RemainingAllowance.DaysLeft);              // 30 - 6
        Assert.Equal(85_500, advice.RemainingAllowance.PerDayAllowance);   // floor(2_052_000 / 24)
    }

    [Fact]
    public async Task RemainingAllowance_zeroWhenSpentBeyondBudget()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 10);
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Belanja", 4_000_000, "big"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(0, advice.RemainingAllowance.RemainingBudget);
        Assert.Equal(0, advice.RemainingAllowance.PerDayAllowance);
    }

    [Fact]
    public async Task RemainingAllowance_lastDayStillYieldsAtLeastOneDay()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 30);
        repo.Rows.Add(Row(new DateOnly(2026, 11, 15), "Makan", 1_000_000, "m"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(1, advice.RemainingAllowance.DaysLeft);
        Assert.Equal(2_900_000, advice.RemainingAllowance.RemainingBudget);
        Assert.Equal(2_900_000, advice.RemainingAllowance.PerDayAllowance);
    }

    [Fact]
    public async Task DailySuggestions_simpleDinnerAlternative_shownWhenFoodSpendExceedsMenuMax()
    {
        // When today's Makan spend already tops the planned menu range, the panel must
        // offer a concrete cheap dinner alternative rather than only a red banner.
        var probe = NewService(new FakeExpenseRepository());
        var d = new DateOnly(2026, 11, 5);
        var max = (await probe.BuildAsync(d, CancellationToken.None)).Daily.BiayaMax;

        var repo = new FakeExpenseRepository();
        repo.Rows.Add(Row(d, "Makan", max + 10_000, "food"));

        var service = NewService(repo);
        var advice = await service.BuildAsync(d, CancellationToken.None);

        Assert.False(string.IsNullOrWhiteSpace(advice.Daily.MalamSederhana));
        // Deterministic per date.
        var again = await service.BuildAsync(d, CancellationToken.None);
        Assert.Equal(advice.Daily.MalamSederhana, again.Daily.MalamSederhana);
    }

    [Fact]
    public async Task DailySuggestions_simpleDinnerAlternative_nullWhenFoodSpendWithinMenuRange()
    {
        var probe = NewService(new FakeExpenseRepository());
        var d = new DateOnly(2026, 11, 6);
        var min = (await probe.BuildAsync(d, CancellationToken.None)).Daily.BiayaMin;

        var repo = new FakeExpenseRepository();
        repo.Rows.Add(Row(d, "Makan", Math.Max(1, min / 2), "food"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Null(advice.Daily.MalamSederhana);
    }

    [Fact]
    public async Task DailySuggestions_simpleDinnerAlternatives_rotateAllEntriesAcrossWindow()
    {
        // The fallback pool rotates on its own coprime stride; over ~16 days every one
        // of the simple-dinner options must surface at least once when over budget.
        var service = NewService(new FakeExpenseRepository());
        var anchor = new DateOnly(2026, 11, 1);
        var seen = new HashSet<string>();
        for (var i = 0; i < 16; i++)
        {
            var d = anchor.AddDays(i);
            var max = (await service.BuildAsync(d, CancellationToken.None)).Daily.BiayaMax;
            var repo = new FakeExpenseRepository();
            repo.Rows.Add(Row(d, "Makan", max + 5_000, $"f{i}"));
            var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);
            Assert.NotNull(advice.Daily.MalamSederhana);
            seen.Add(advice.Daily.MalamSederhana!);
        }
        Assert.Equal(8, seen.Count); // full simple-dinner pool surfaced within the window
    }

    [Fact]
    public async Task MonthlyNabung_reflectsDepositsAgainstTarget()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        // Two deposits before/on the analysed date; one after is not yet "collected".
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Nabung", 500_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 8), "Nabung", 300_000, "b"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 15), "Nabung", 400_000, "c"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 8), CancellationToken.None);

        var n = advice.MonthlyNabung;
        Assert.Equal(3_100_000, n.Target);
        Assert.Equal(800_000, n.CollectedThisMonth);
        Assert.Equal(2_300_000, n.Remaining);
        Assert.True(n.PercentCollected > 25.7 && n.PercentCollected < 25.9);
    }

    [Fact]
    public async Task MonthlyNabung_zeroWhenNoTarget()
    {
        var repo = new FakeExpenseRepository(); // no target
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Nabung", 500_000, "a"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 8), CancellationToken.None);

        var n = advice.MonthlyNabung;
        Assert.Equal(0, n.Target);
        // Collected still reflects actual deposits even when no target is set.
        Assert.Equal(500_000, n.CollectedThisMonth);
        Assert.Equal(0, n.Remaining);
        Assert.Equal(0, n.PercentCollected);
    }

    [Fact]
    public async Task MonthlyNabung_excludesDepositsAfterAnalysedDate()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        repo.Rows.Add(Row(new DateOnly(2026, 11, 5), "Nabung", 200_000, "a"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 12), "Nabung", 900_000, "b"));

        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 8), CancellationToken.None);

        Assert.Equal(200_000, advice.MonthlyNabung.CollectedThisMonth);
    }

    [Fact]
    public async Task MonthlyNabung_projectedSavings_meetsTargetWhenSpendPaceAllows()
    {
        // No non-Nabung spend yet → the projection rounds to ~0 spend, so the whole
        // budget is still available to bank → the 3.1jt savings target is covered.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var advice = await NewService(repo).BuildAsync(new DateOnly(2026, 11, 8), CancellationToken.None);

        var n = advice.MonthlyNabung;
        Assert.Equal(3_900_000, n.ProjectedSavings);
        Assert.Equal(0, n.ProjectedDeficit);
    }

    [Fact]
    public async Task MonthlyNabung_projectedDeficit_whenSpendPaceFallsShortOfMonthlyTarget()
    {
        // Same scenario as RemainingAllowance: a lumpy sewa bill + current daily pace
        // projects ~4.04jt spend (over budget) → nothing left to save → the full
        // 3.1jt target is the shortfall. This is the "at this pace I can't hit my
        // savings goal" signal the panel must surface.
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 6);
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Tagihan", 1_300_000, "kos"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 1), "Makan", 53_000, "m1"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 2), "Makan", 30_000, "m2"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 3), "Transport", 160_000, "t1"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 4), "Makan", 72_000, "m3"));
        repo.Rows.Add(Row(new DateOnly(2026, 11, 5), "Makan", 50_000, "m4"));
        repo.Rows.Add(Row(d, "Makan", 183_000, "m5"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(4_040_000, advice.Projection.ProjectedTotal);
        var n = advice.MonthlyNabung;
        Assert.Equal(0, n.ProjectedSavings);
        Assert.Equal(3_100_000, n.ProjectedDeficit);
    }

    [Fact]
    public async Task JajanTotal_sumsSnackRowsLoggedUnderMakan()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 8);
        void AddMakan(long nominal, string ket, string id)
        {
            var row = Row(d, "Makan", nominal, id);
            row.Keterangan = ket;
            repo.Rows.Add(row);
        }
        AddMakan(55_000, "Jajan", "a");
        AddMakan(50_000, "Jajan", "b");
        AddMakan(80_000, "jajan", "c");
        AddMakan(23_000, "Makan siang", "d");
        AddMakan(5_000, "Minuman", "e");
        repo.Rows.Add(Row(d, "Transport", 60_000, "t"));

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(185_000, advice.JajanTotal);
    }

    [Fact]
    public async Task JajanTotal_isZeroWhenNoSnackKeywordsPresent()
    {
        var repo = new FakeExpenseRepository
        {
            Target = new ExpenseTarget { Month = "2026-11", Anggaran = 3_900_000, TargetNabung = 3_100_000 },
        };
        var d = new DateOnly(2026, 11, 8);
        void AddMakan(long nominal, string ket, string id)
        {
            var row = Row(d, "Makan", nominal, id);
            row.Keterangan = ket;
            repo.Rows.Add(row);
        }
        AddMakan(30_000, "Makan siang", "a");
        AddMakan(23_000, "Sate", "b");
        AddMakan(15_000, "Ayam penyet", "c");
        AddMakan(18_000, "Sup buah mangga", "d");

        var advice = await NewService(repo).BuildAsync(d, CancellationToken.None);

        Assert.Equal(0, advice.JajanTotal);
    }
}

