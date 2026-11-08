namespace OmniChat.Domain.Entities;

/// <summary>
/// One curated promo/event entry. Maintained by the agent event-hunter cron and
/// imported via the seeder. Read-only in the web UI; source lives in the private
/// Tools repo.
/// </summary>
public class PromoEvent
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>Canonical platform/app name (GoPay, OVO, DANA, …).</summary>
    public string Aplikasi { get; set; } = string.Empty;

    /// <summary>Short title / headline (e.g. "Cashback 50% GoPay Coins").</summary>
    public string Judul { get; set; } = string.Empty;

    /// <summary>Optional benefit summary (cashback %, voucher, bonus saldo).</summary>
    public string? Benefit { get; set; }

    /// <summary>Optional terms/requirements as free text.</summary>
    public string? Syarat { get; set; }

    /// <summary>Optional official promo URL.</summary>
    public string? Link { get; set; }

    /// <summary>Expiry as free text when known ("31 Okt 2026", "s/d ?").</summary>
    public string? BerlakuSampai { get; set; }

    /// <summary>When the event was first found (WIB).</summary>
    public DateOnly Ditemukan { get; set; }

    /// <summary>Source dedup hash (platform|judul) from seen-events.json; unique.</summary>
    public string? SourceId { get; set; }
}
