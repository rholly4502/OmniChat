namespace OmniChat.Infrastructure.Services;

/// <summary>One category with its month total (trend block of the advice).</summary>
public sealed record CategoryTrendItem(
    string Kategori,
    long Total,
    long PreviousTotal,
    long Delta,
    double? PercentChange);

/// <summary>End-of-month spend projection from the run-rate so far.</summary>
public sealed record Projection(
    long SpentSoFar, int DaysElapsed, int DaysInMonth, long ProjectedTotal, long Anggaran, long ProjectedOver,
    long FixedCommitted, long Discretionary);

/// <summary>One PC-goal part and its price.</summary>
public sealed record PartItem(string Name, long Price);

/// <summary>The PC-goal saving estimate block.</summary>
public sealed record PcGoal(
    IReadOnlyList<PartItem> Parts,
    long TotalNeeded,
    long NabungSoFar,
    double PercentCollected,
    long Remaining,
    long PotentialSavingPerMonth,
    int? MonthsToReach);

/// <summary>Rotating, deterministic daily suggestions: a frugal/healthy menu set,
/// an activity, a fun fact, and a kos-saving tip, all keyed to the date.</summary>
public sealed record DailySuggestions(
    string Sarapan,
    string MakanSiang,
    string MakanMalam,
    string Biaya,
    string Aktivitas,
    string FunFact,
    string TipAnakKos,
    long FoodSpend,
    int BiayaMin,
    int BiayaMax,
    string? MalamSederhana,
    long AvgDailyMakan);

/// <summary>Spend-pace comparison: cumulative non-Nabung spend through the same
/// day-of-month, this month vs last month. A factual baseline for whether the month
/// is running ahead of or behind the user's own history.</summary>
public sealed record Pace(
    string CurrentMonth,
    int Day,
    long CurrentThroughDay,
    string PreviousMonth,
    long PreviousThroughDay,
    long Delta,
    double? PercentChange);

/// <summary>What the user can still afford per day for the rest of the month,
/// given what has already been spent. The actionable counterpart to the static
/// daily budget (which assumes a uniform spend from day 1 — rarely true once a
/// lumpy bill like sewa kos lands early).</summary>
public sealed record RemainingAllowance(
    long Anggaran,
    long SpentSoFar,
    long RemainingBudget,
    int DaysLeft,
    long PerDayAllowance);

/// <summary>This month's savings effort vs the user-set monthly target
/// (target_nabung). The actionable near-term counterpart to the long-term PC
/// goal: how much of this month's saving target has been set aside so far.</summary>
public sealed record MonthlyNabung(
    long Target,
    long CollectedThisMonth,
    double PercentCollected,
    long Remaining,
    long ProjectedSavings,
    long ProjectedDeficit);

/// <summary>This month's largest controllable discretionary (non-food, non-fixed)
/// spending leak, with a concrete way to cut it. Picked from the trend categories,
/// so it is always backed by the actual ledger.</summary>
public sealed record BiggestLeak(string Kategori, long Total, string Tip);

/// <summary>
/// Full payload served by <c>GET /api/expenses/advice?date=YYYY-MM-DD</c>.
/// </summary>
public sealed record ExpenseAdvice(
    string Date,
    string Month,
    long DayTotal,
    long DailyBudget,
    string Status,
    long OverBy,
    IReadOnlyList<string> Suggestions,
    IReadOnlyList<CategoryTrendItem> CategoryTrend,
    Projection Projection,
    Pace Pace,
    PcGoal PcGoal,
    DailySuggestions Daily,
    RemainingAllowance RemainingAllowance,
    MonthlyNabung MonthlyNabung,
    long JajanTotal,
    BiggestLeak? BiggestLeak);
