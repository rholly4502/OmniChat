using System.Text;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for the dependency-free <see cref="JobsPdfReport"/> writer: the
/// emitted bytes form a structurally valid PDF (header, objects, xref, trailer)
/// and paginate past a single page instead of truncating the pipeline tail.
/// </summary>
public sealed class JobsPdfReportTests
{
    private static Opportunity Job(string judul = ".NET Developer", string status = "applied", DateOnly? followUp = null) => new()
    {
        Id = 1,
        Judul = judul,
        Perusahaan = "PT Contoh, Tbk",
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Gaji = "15-20jt",
        Skor = 82,
        Status = status,
        FollowUpTanggal = followUp,
        Ditemukan = new DateOnly(2026, 11, 5),
    };

    [Fact]
    public void Build_startsWithPdfHeader()
    {
        var bytes = JobsPdfReport.Build(new[] { Job() });
        Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(bytes));
    }

    [Fact]
    public void Build_singlePage_WhenFewRows()
    {
        var text = Encoding.ASCII.GetString(JobsPdfReport.Build(new[] { Job(), Job("Senior .NET") }));
        Assert.Contains("/Count 1", text);
        Assert.Equal(1, CountOf(text, "/Type /Page "));
        Assert.EndsWith("%%EOF", text.TrimEnd());
    }

    [Fact]
    public void Build_paginates_WhenManyRows()
    {
        var rows = Enumerable.Range(0, 120).Select(i => Job($"Job {i}")).ToList();
        var text = Encoding.ASCII.GetString(JobsPdfReport.Build(rows));

        // At least two page objects, and the very last row is present — no truncation.
        Assert.True(CountOf(text, "/Type /Page ") >= 2);
        Assert.Contains("Job 119", text);
        Assert.EndsWith("%%EOF", text.TrimEnd());
    }

    [Fact]
    public void Build_embedsTitleStatusLabelAndFollowUp()
    {
        var text = Encoding.ASCII.GetString(
            JobsPdfReport.Build(new[] { Job(followUp: new DateOnly(2026, 12, 1)) }));
        Assert.Contains("Ringkasan Pipeline Lowongan", text);
        Assert.Contains("Dilamar", text); // applied status label
        Assert.Contains("2026-12-01", text); // follow-up date column
    }

    [Fact]
    public void Build_escapesParenthesesInText()
    {
        var text = Encoding.ASCII.GetString(JobsPdfReport.Build(new[] { Job("Engineer (.NET)") }));
        Assert.Contains("\\(", text);
        Assert.Contains("\\)", text);
    }

    [Fact]
    public void Build_embedsPipelineStageDates()
    {
        var text = Encoding.ASCII.GetString(JobsPdfReport.Build(new[]
        {
            new Opportunity
            {
                Id = 1,
                Judul = ".NET Developer",
                Perusahaan = "PT Contoh",
                Lokasi = "Remote",
                Tipe = "Kontrak",
                Status = "offer",
                Ditemukan = new DateOnly(2026, 11, 5),
                DilamarPada = new DateOnly(2026, 11, 12),
                InterviewPada = new DateOnly(2026, 11, 17),
                TawaranPada = new DateOnly(2026, 11, 22),
            },
        }));

        Assert.Contains("Dilamar 2026-11-12", text);
        Assert.Contains("Interview 2026-11-17", text);
        Assert.Contains("Tawaran 2026-11-22", text);
    }

    private static int CountOf(string s, string sub)
    {
        var n = 0;
        var i = 0;
        while ((i = s.IndexOf(sub, i, StringComparison.Ordinal)) >= 0)
        {
            n++;
            i += sub.Length;
        }
        return n;
    }
}
