namespace OmniChat.Domain.Entities;

/// <summary>
/// One curated job opportunity. The list is maintained by an agent cron that searches
/// and filters to "yes" roles (.NET, ~2y, realistic) for Rholly. Read-only in the web
/// UI; the source file lives in the private Tools repo.
/// </summary>
public class Opportunity
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>Job title (e.g. ".NET Developer").</summary>
    public string Judul { get; set; } = string.Empty;

    /// <summary>Company / hiring organization.</summary>
    public string Perusahaan { get; set; } = string.Empty;

    /// <summary>Location or "Remote" / "Hybrid".</summary>
    public string Lokasi { get; set; } = string.Empty;

    /// <summary>Employment type: "Kontrak", "FTE", or "Kotrak/FTE".</summary>
    public string Tipe { get; set; } = string.Empty;

    /// <summary>Optional salary range as free text.</summary>
    public string? Gaji { get; set; }

    /// <summary>Fit score 0-100 from the agent rubric (null = not scored).</summary>
    public int? Skor { get; set; }

    /// <summary>Source URL (job posting / company page).</summary>
    public string? Link { get; set; }

    /// <summary>Short note on why this is a "yes" for Rholly.</summary>
    public string? Catatan { get; set; }

    /// <summary>Pipeline status: new, applied, interview, offer, closed.</summary>
    public string Status { get; set; } = "new";

    /// <summary>
    /// Optional target date for the next follow-up (e.g. to chase an applied or
    /// interviewed role). Null means no follow-up scheduled.
    /// </summary>
    public DateOnly? FollowUpTanggal { get; set; }

    /// <summary>When the opportunity was first found (WIB).</summary>
    public DateOnly Ditemukan { get; set; }

    /// <summary>Source dedup id from the agent's seen-jobs.json; unique when present.</summary>
    public string? SourceId { get; set; }
}
