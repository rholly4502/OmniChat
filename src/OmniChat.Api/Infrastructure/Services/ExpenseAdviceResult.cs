namespace OmniChat.Infrastructure.Services;

/// <summary>One category with its month total (trend block of the advice).</summary>
public sealed record CategoryTrendItem(string Kategori, long Total);

/// <summary>End-of-month spend projection from the run-rate so far.</summary>
public sealed record Projection(
    long SpentSoFar, int DaysElapsed, int DaysInMonth, long ProjectedTotal, long Anggaran, long ProjectedOver);

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
    PcGoal PcGoal);
