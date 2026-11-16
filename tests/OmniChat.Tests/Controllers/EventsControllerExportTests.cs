using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using System.Text;

namespace OmniChat.Tests.Controllers;

public class EventsControllerExportTests
{
    private readonly Mock<IPromoEventRepository> _repository = new();

    private EventsController CreateController() => new(_repository.Object);

    private static PromoEvent Event(
        string aplikasi = "OVO",
        string? judul = "Cashback 50%",
        string? syarat = "Min. transaksi Rp50.000",
        DateOnly? ditemukan = null,
        string? berlakuSampai = "31 Des 2026") => new()
    {
        Id = 1,
        Aplikasi = aplikasi,
        Judul = judul!,
        Benefit = "Maks Rp20.000",
        Syarat = syarat,
        Link = null,
        BerlakuSampai = berlakuSampai,
        Ditemukan = ditemukan ?? new DateOnly(2026, 11, 14),
        SourceId = null,
    };

    [Fact]
    public async Task Export_ReturnsCsvFile_WithHeaderAndRows()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Event(), Event("DANA", "Voucher 20%") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null));

        Assert.Equal("text/csv; charset=utf-8", file.ContentType);
        Assert.EndsWith(".csv", file.FileDownloadName);

        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');
        var lines = text.TrimEnd('\n').Split('\n');
        Assert.StartsWith("aplikasi,judul,benefit,syarat,berlakuSampai,ditemukan", lines[0]);
        Assert.Equal(3, lines.Length); // header + 2 rows
        Assert.Contains("Min. transaksi Rp50.000", text);
    }

    [Fact]
    public async Task Export_PassesAppFilterToRepository()
    {
        var filtered = new[] { Event() };
        _repository.Setup(r => r.ListAsync("OVO", It.IsAny<CancellationToken>())).ReturnsAsync(filtered);

        await CreateController().Export(aplikasi: "OVO");

        _repository.Verify(r => r.ListAsync("OVO", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Export_DoublesEmbeddedQuotes()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Event(judul: "Promo \"Berkah\"") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("\"Promo \"\"Berkah\"\"\"", text);
    }

    [Fact]
    public async Task Export_WritesDiscoveredDate_IsoFormat()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Event(ditemukan: new DateOnly(2026, 11, 14)) });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("2026-11-14", text);
    }

    [Fact]
    public async Task Export_AppliesKeywordFilter()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Event(), Event("DANA", "Voucher 20%", "Tanpa syarat") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null, q: "cashback"));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("Cashback 50%", text);
        Assert.DoesNotContain("Voucher 20%", text);
    }

    [Fact]
    public async Task Export_HidesExpired_WhenRequested()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Event(judul: "Promo Lama", berlakuSampai: "2026-01-01"), // past -> expired
                Event("DANA", "Promo Baru", "Tanpa syarat", berlakuSampai: "2026-12-31"), // future -> active
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null, hideExpired: true));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("Promo Baru", text);
        Assert.DoesNotContain("Promo Lama", text);
    }

    [Fact]
    public async Task Export_KeepsExpired_WhenNotRequested()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Event(judul: "Promo Lama", berlakuSampai: "2026-01-01"),
                Event("DANA", "Promo Baru", "Tanpa syarat", berlakuSampai: "2026-12-31"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(aplikasi: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("Promo Lama", text);
        Assert.Contains("Promo Baru", text);
    }
}
