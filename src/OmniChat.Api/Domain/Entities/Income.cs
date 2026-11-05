namespace OmniChat.Domain.Entities;

/// <summary>
/// One income/pemasukan row imported from the <c>pemasukan.csv</c> ledger.
/// Separate from expenses by design — income must never be counted toward spending.
/// Read-only in the web UI; the ledger repo stays the write side.
/// </summary>
public class Income
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>Income date in WIB (YYYY-MM-DD), as written in the ledger.</summary>
    public DateOnly Tanggal { get; set; }

    /// <summary>Free-text note (e.g. "Gaji (pemasukan)").</summary>
    public string Keterangan { get; set; } = string.Empty;

    /// <summary>Amount in rupiah (integer, no separators).</summary>
    public long Nominal { get; set; }

    /// <summary>The ledger's correction id; unique when present, null when a row lacks one.</summary>
    public string? SourceId { get; set; }
}
