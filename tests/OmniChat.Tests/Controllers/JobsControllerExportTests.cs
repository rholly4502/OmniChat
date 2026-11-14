using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using System.Text;

namespace OmniChat.Tests.Controllers;

public class JobsControllerExportTests
{
    private readonly Mock<IOpportunityRepository> _repository = new();

    private JobsController CreateController() => new(_repository.Object, new Mock<ILamaranDraftService>().Object);

    private static Opportunity Opportunity(
        string status = "new",
        string? perusahaan = "PT Contoh, Tbk",
        int? skor = 82,
        DateOnly? followUp = null) => new()
    {
        Id = 1,
        Judul = ".NET Developer",
        Perusahaan = perusahaan,
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Gaji = "15-20jt",
        Skor = skor,
        Status = status,
        FollowUpTanggal = followUp,
        Ditemukan = new DateOnly(2026, 11, 5),
        Link = null,
        Catatan = null,
    };

    [Fact]
    public async Task Export_ReturnsCsvFile_WithHeaderAndRows()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity(), Opportunity("interview", "PT Lain") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null));

        Assert.Equal("text/csv; charset=utf-8", file.ContentType);
        Assert.EndsWith(".csv", file.FileDownloadName);

        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');
        var lines = text.TrimEnd('\n').Split('\n');
        Assert.StartsWith("judul,perusahaan,lokasi,tipe,gaji,skor,status,followUpTanggal,ditemukan", lines[0]);
        Assert.Equal(3, lines.Length); // header + 2 quoted
        Assert.Contains("\"PT Contoh, Tbk\"", text); // comma field is quoted
    }

    [Fact]
    public async Task Export_PassesStatusFilterToRepository()
    {
        var filtered = new[] { Opportunity("applied") };
        _repository.Setup(r => r.ListAsync("applied", It.IsAny<CancellationToken>())).ReturnsAsync(filtered);

        await CreateController().Export(status: "applied");

        _repository.Verify(r => r.ListAsync("applied", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Export_DoublesEmbeddedQuotes()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity(perusahaan: "PT \"Berkah\"") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("\"PT \"\"Berkah\"\"\"", text);
    }

    [Fact]
    public async Task Export_WritesFollowUpDate_WhenSet()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity(followUp: new DateOnly(2026, 11, 20)) });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("2026-11-20", text);
    }
}
