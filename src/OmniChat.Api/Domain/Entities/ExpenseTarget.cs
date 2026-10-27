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

    /// <summary>Optional note explaining how the numbers were derived.</summary>
    public string? Catatan { get; set; }
}
