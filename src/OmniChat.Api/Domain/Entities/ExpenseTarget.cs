namespace OmniChat.Domain.Entities;

/// <summary>
/// Monthly budget and saving target for the Pengeluaran tab, in from
/// <c>target.json</c> (one object per <c>YYYY-MM</c> month).
/// </summary>
public class ExpenseTarget
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>Month key, <c>YYYY-MM</c> (e.g. <c>2026-10</c>). Unique.</summary>
    public string Month { get; set; } = string.Empty;

    /// <summary>Amount the user wants to set aside that month, in rupiah.</summary>
    public long TargetNabung { get; set; }

    /// <summary>Monthly spending cap (excluding saving), in rupiah.</summary>
    public long Anggaran { get; set; }

    /// <summary>Optional number of active (spending) days in the month — prorates the
    /// daily budget for partial months (e.g. a month that starts mid-calendar-month).
    /// Null means the calendar day count.</summary>
    public int? Hari { get; set; }

    /// <summary>Optional note explaining how the numbers were derived.</summary>
    public string? Catatan { get; set; }

    /// <summary>True when the user edited this target from the web UI. The hourly
    /// ledger seeder must NOT overwrite a target the user has set manually — the
    /// web edit is the newer, explicit intent. False for ledger-seeded rows.</summary>
    public bool IsUserEdited { get; set; }
}
