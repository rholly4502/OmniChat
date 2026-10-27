namespace OmniChat.Domain.Entities;

/// <summary>
/// One expense row imported from the Pengeluaran ledger (one CSV row per month).
/// Read-only for now: the web UI displays it; the ledger repo stays the write side.
/// </summary>
/// <remarks>
/// <see cref="SourceId"/> is the 6-character correction id from the CSV (e.g.
/// <c>a1b2c3</c>). It is the deduplication key for idempotent seeding: re-running
/// the importer skips any row whose SourceId is already present.
/// </remarks>
public class Expense
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>Expense date in WIB (YYYY-MM-DD), as written in the ledger.</summary>
    public DateOnly Tanggal { get; set; }

    /// <summary>Time of day HH:MM (WIB), as written in the ledger.</summary>
    public string Waktu { get; set; } = string.Empty;

    /// <summary>One of: Makan, Transport, Belanja, Tagihan, Kesehatan, Hiburan, Nabung, Lain.</summary>
    public string Kategori { get; set; } = string.Empty;

    /// <summary>Free-text note for the expense.</summary>
    public string Keterangan { get; set; } = string.Empty;

    /// <summary>Amount in rupiah (integer, no separators).</summary>
    public long Nominal { get; set; }

    /// <summary>The ledger's correction id; unique when present, null when a row lacks one.</summary>
    public string? SourceId { get; set; }
}
