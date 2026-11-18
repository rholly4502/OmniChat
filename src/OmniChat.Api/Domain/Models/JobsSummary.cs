namespace OmniChat.Domain.Models;

/// <summary>
/// One active opportunity surfaced on the digest as a top match, so the
/// Ringkasan card can show *which* roles to prioritise without loading the
/// full curated list.
/// </summary>
public sealed record TopOpportunity(
    /// <summary>Opportunity id (for deep-link / actions).</summary>
    long Id,
    /// <summary>Job title.</summary>
    string Judul,
    /// <summary>Company / hiring organization.</summary>
    string Perusahaan,
    /// <summary>Fit score 0-100 (agent rubric).</summary>
    int Skor,
    /// <summary>Current pipeline status (new/applied/interview/offer/closed).</summary>
    string Status);

/// <summary>
/// Pipeline overview for the curated job list: counts per status plus
/// follow-up urgency buckets relative to a given WIB day, and the top few
/// active opportunities by fit score.
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
    int FollowUp7Hari,
    /// <summary>Top 3 active (non-closed) opportunities by fit score, best first.</summary>
    IReadOnlyList<TopOpportunity> TopCocok);
