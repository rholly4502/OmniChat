namespace OmniChat.Domain.Models;

/// <summary>
/// Optional monthly budget/savings figures printed as a "Ringkasan bulan"
/// block above the transaction table. Null fields are omitted so a report
/// for a month without a target still renders cleanly.
/// </summary>
public sealed record ExpenseBudgetSummary(
    long? Anggaran,
    long? SisaAnggaran,
    long? TargetNabung,
    long Ditabung,
    long DanaNabungKumulatif);
