namespace OmniChat.Domain.Models;

/// <summary>
/// Pipeline overview for the curated job list: counts per status plus
/// follow-up urgency buckets relative to a given WIB day.
/// </summary>
public sealed record JobsSummary(
    /// <summary>Count of opportunities per pipeline status (key = status name).</summary>
    IReadOnlyDictionary<string, int> PerStatus,
    /// <summary>Total number of opportunities.</summary>
    int Total,
    /// <summary>Follow-ups with a target date before today.</summary>
    int FollowUpTerlambat,
    /// <summary>Follow-ups targeted for today.</summary>
    int FollowUpHariIni,
    /// <summary>Follow-ups targeted within the next 7 days (after today).</summary>
    int FollowUp7Hari);
