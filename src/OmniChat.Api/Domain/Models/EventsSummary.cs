namespace OmniChat.Domain.Models;

/// <summary>
/// Digest of the curated promo/event list for the Ringkasan card: totals and
/// expiry urgency buckets relative to a given WIB day, plus how many promos are
/// still usable (active and not yet marked as used). Mirrors the lightweight
/// <see cref="JobsSummary"/> pattern so the digest never has to load the full
/// event list.
/// </summary>
public sealed record EventsSummary(
    /// <summary>Total number of curated events.</summary>
    int Total,
    /// <summary>Number of distinct source platforms (aplikasi).</summary>
    int SumberUnik,
    /// <summary>Events whose known end date is today.</summary>
    int BerakhirHariIni,
    /// <summary>Events whose known end date is tomorrow.</summary>
    int BesokBerakhir,
    /// <summary>Events ending within the next 7 days (after tomorrow, i.e. 2–7 days out).</summary>
    int Dalam7Hari,
    /// <summary>Events whose known end date has already passed (stale promos).</summary>
    int SudahBerakhir,
    /// <summary>Events the owner has already marked as redeemed/used.</summary>
    int TotalDipakai,
    /// <summary>Events still active (not expired) and not yet used.</summary>
    int SisaAktif);
