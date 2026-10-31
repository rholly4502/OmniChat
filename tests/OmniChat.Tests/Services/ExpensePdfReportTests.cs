using System.Text;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for the dependency-free <see cref="ExpensePdfReport"/> writer: the
/// emitted bytes form a structurally valid single-page PDF (header, objects,
/// xref, trailer) and embed the expected report text.
/// </summary>
public sealed class ExpensePdfReportTests
{
    private static readonly Expense[] SampleRows =
    [
        new() { Tanggal = new DateOnly(2026, 10, 28), Waktu = "12:30", Kategori = "Makan",
            Keterangan = "Warteg", Nominal = 20_000, SourceId = "a1b2c3" },
        new() { Tanggal = new DateOnly(2026, 10, 29), Waktu = "09:10", Kategori = "Belanja",
            Keterangan = "Belanja, grosir", Nominal = 300_000, SourceId = "a1b2e5" },
    ];

    [Fact]
    public void Build_startsWithPdfHeader()
    {
        var bytes = ExpensePdfReport.Build("2026-10", SampleRows);

        Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(bytes));
    }

    [Fact]
    public void Build_hasXrefAndTrailer()
    {
        var bytes = ExpensePdfReport.Build("2026-10", SampleRows);
        var text = Encoding.ASCII.GetString(bytes);

        Assert.Contains("xref", text);
        Assert.Contains("trailer", text);
        Assert.Contains("startxref", text);
        Assert.EndsWith("%%EOF\n", text);
    }

    [Fact]
    public void Build_xrefOffsetsPointAtObjects()
    {
        var text = Encoding.ASCII.GetString(ExpensePdfReport.Build("2026-10", SampleRows));
        var lines = text.Split('\n');

        var xrefIndex = Array.FindIndex(lines, l => l.Trim() == "xref");
        Assert.True(xrefIndex > 0);

        // xref layout: header line, object count line, one free-object line,
        // then one offset line per object. So object 1's offset is 3 lines down.
        var offsets = lines
            .Skip(xrefIndex + 3)
            .Take(5)
            .Select(l => long.Parse(l.Split(' ')[0]))
            .ToArray();
        Assert.Equal(5, offsets.Length);

        for (var i = 0; i < offsets.Length; i++)
        {
            var marker = $"{i + 1} 0 obj";
            Assert.Equal(offsets[i], text.IndexOf(marker, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void Build_containsReportText()
    {
        var text = Encoding.ASCII.GetString(ExpensePdfReport.Build("2026-10", SampleRows));

        Assert.Contains("Laporan Pengeluaran 2026-10", text);
        Assert.Contains("2026-10-28", text);
        Assert.Contains("Warteg", text);
        // Nominal formatted with thousands separator.
        Assert.Contains("300,000", text);
        Assert.Contains("Total", text);
        Assert.Contains("320,000", text);
    }

    [Fact]
    public void Build_escapesPdfLiterals()
    {
        var rows = new[] { new Expense { Tanggal = new DateOnly(2026, 10, 1), Waktu = "08:00",
            Kategori = "Catatan", Keterangan = "biaya (luar biasa) \\ aneh", Nominal = 5_000, SourceId = "x" } };

        var text = Encoding.ASCII.GetString(ExpensePdfReport.Build("2026-10", rows));

        Assert.Contains(@"biaya \(luar biasa\) \\ aneh", text);
    }

    [Fact]
    public void Build_dropsNonAscii()
    {
        var rows = new[] { new Expense { Tanggal = new DateOnly(2026, 10, 1), Waktu = "08:00",
            Kategori = "Makan", Keterangan = "nasi goreng siang 🌶️", Nominal = 15_000, SourceId = "x" } };

        var text = Encoding.ASCII.GetString(ExpensePdfReport.Build("2026-10", rows));

        // The emoji bytes must not appear raw; they are replaced with '?'.
        Assert.DoesNotContain("🌶️", text);
        Assert.Contains("nasi goreng siang ???", text);
    }
}
