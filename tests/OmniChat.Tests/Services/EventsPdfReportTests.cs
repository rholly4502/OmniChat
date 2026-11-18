using System.Text;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for the dependency-free <see cref="EventsPdfReport"/> writer: the
/// emitted bytes form a structurally valid PDF (header, objects, xref, trailer)
/// and paginate past a single page instead of truncating the event tail.
/// </summary>
public sealed class EventsPdfReportTests
{
    private static readonly DateOnly Today = new(2026, 11, 17);

    private static PromoEvent Event(
        string judul = "Cashback 50% GoPay",
        string? berlakuSampai = "2026-12-31",
        string? benefit = "Maks Rp20.000") => new()
    {
        Id = 1,
        Aplikasi = "GoPay",
        Judul = judul,
        Benefit = benefit,
        Syarat = "Min. transaksi Rp50.000",
        Link = null,
        BerlakuSampai = berlakuSampai,
        Ditemukan = new DateOnly(2026, 11, 14),
        SourceId = null,
    };

    [Fact]
    public void Build_startsWithPdfHeader()
    {
        var bytes = EventsPdfReport.Build(new[] { Event() }, Today);
        Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(bytes));
    }

    [Fact]
    public void Build_singlePage_WhenFewRows()
    {
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(new[] { Event(), Event("Voucher 20% DANA") }, Today));
        Assert.Contains("/Count 1", text);
        Assert.Equal(1, CountOf(text, "/Type /Page "));
        Assert.EndsWith("%%EOF", text.TrimEnd());
    }

    [Fact]
    public void Build_paginates_WhenManyRows()
    {
        var rows = Enumerable.Range(0, 120).Select(i => Event($"Promo {i}")).ToList();
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(rows, Today));

        // At least two page objects, and the very last row is present — no truncation.
        Assert.True(CountOf(text, "/Type /Page ") >= 2);
        Assert.Contains("Promo 119", text);
        Assert.EndsWith("%%EOF", text.TrimEnd());
    }

    [Fact]
    public void Build_embedsTitleAndEventRows()
    {
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(new[] { Event() }, Today));
        Assert.Contains("Ringkasan Event & Promo", text);
        Assert.Contains("Cashback 50% GoPay", text);
        Assert.Contains("GoPay", text);
    }

    [Fact]
    public void Build_labelsStatus_ByEndDate()
    {
        // Active (end in future) vs expired (end in past) vs open-ended.
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(
            new[]
            {
                Event(berlakuSampai: "2026-12-31"),
                Event("Promo Lama", berlakuSampai: "2026-01-01"),
                Event("Tanpa Batas", berlakuSampai: null),
            },
            Today));

        Assert.Contains("Berlaku", text);
        Assert.Contains("Kedaluwarsa", text);
        Assert.Contains("Tanpa batas", text);
    }

    [Fact]
    public void Build_escapesParenthesesInText()
    {
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(new[] { Event("Promo (Bonus)") }, Today));
        Assert.Contains("\\(", text);
        Assert.Contains("\\)", text);
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

    [Fact]
    public void Build_marksUsedPromos()
    {
        var text = Encoding.ASCII.GetString(EventsPdfReport.Build(
            new[]
            {
                new PromoEvent { Id = 1, Aplikasi = "GoPay", Judul = "Promo Dipakai", Benefit = "Maks Rp20.000", Syarat = "Min. transaksi Rp50.000", BerlakuSampai = "2026-12-31", Ditemukan = new DateOnly(2026, 11, 14), Dipakai = true },
                Event("Promo Belum"),
            },
            Today));

        Assert.Contains("Dipakai", text);
        Assert.Contains("Ya", text);
    }

}
