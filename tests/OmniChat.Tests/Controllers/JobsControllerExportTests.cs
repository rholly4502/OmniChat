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
        DateOnly? followUp = null,
        DateOnly? dilamarPada = null,
        DateOnly? interviewPada = null,
        DateOnly? tawaranPada = null) => new()
    {
        Id = 1,
        Judul = ".NET Developer",
        Perusahaan = perusahaan!,
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Gaji = "15-20jt",
        Skor = skor,
        Status = status,
        FollowUpTanggal = followUp,
        DilamarPada = dilamarPada,
        InterviewPada = interviewPada,
        TawaranPada = tawaranPada,
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
        Assert.StartsWith("judul,perusahaan,lokasi,tipe,gaji,skor,status,followUpTanggal,dilamarPada,interviewPada,tawaranPada,ditemukan", lines[0]);
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

    [Fact]
    public async Task Export_WritesPipelineStageDates_WhenSet()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity(
                status: "offer",
                dilamarPada: new DateOnly(2026, 11, 12),
                interviewPada: new DateOnly(2026, 11, 17),
                tawaranPada: new DateOnly(2026, 11, 22)) });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null));
        var text = Encoding.UTF8.GetString(file.FileContents).Trim('\uFEFF');

        Assert.Contains("2026-11-12,2026-11-17,2026-11-22", text);
    }

    [Fact]
    public async Task Export_AppliesTipeFilter()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Opp(tipe: "Kontrak", perusahaan: "PT Kontrak"),
                Opp(tipe: "FTE", perusahaan: "PT FTE"),
                Opp(tipe: "Ops", perusahaan: "PT Ops"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, tipe: "Kontrak"));

        var body = Body(file);
        Assert.Contains("PT Kontrak", body);
        Assert.DoesNotContain("PT FTE", body);
        Assert.DoesNotContain("PT Ops", body);
    }

    [Fact]
    public async Task Export_AppliesTierFilter()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Opp(status: "new", tipe: "Part-time", perusahaan: "PT High"),
                Opp(status: "new", tipe: "Kontrak", lokasi: "Jakarta", perusahaan: "PT Medium"),
                Opp(status: "applied", tipe: "Kontrak", perusahaan: "PT Low"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, tier: "high"));

        var body = Body(file);
        Assert.Contains("PT High", body);
        Assert.DoesNotContain("PT Medium", body);
        Assert.DoesNotContain("PT Low", body);
    }

    [Fact]
    public async Task Export_AppliesKeywordFilter_AcrossFields()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Opp(lokasi: "Singapura", perusahaan: "PT A"),
                Opp(catatan: "membutuhkan microservices", perusahaan: "PT B"),
                Opp(perusahaan: "PT Sepeda"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, q: "singapura"));

        var body = Body(file);
        Assert.Contains("PT A", body);
        Assert.DoesNotContain("PT B", body);
        Assert.DoesNotContain("PT Sepeda", body);
    }

    [Fact]
    public async Task Export_AppliesFollowUpOnlyFilter_WithProvidedToday()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Opp(status: "interview", followUp: new DateOnly(2026, 11, 14), perusahaan: "PT Overdue"),
                Opp(status: "applied", followUp: new DateOnly(2026, 11, 20), perusahaan: "PT Future"),
                Opp(status: "new", followUp: new DateOnly(2026, 11, 10), perusahaan: "PT NotActive"),
                Opp(status: "offer", followUp: null, perusahaan: "PT NoFollowUp"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, followUpOnly: true, today: "2026-11-15"));

        var body = Body(file);
        Assert.Contains("PT Overdue", body);
        Assert.DoesNotContain("PT Future", body);
        Assert.DoesNotContain("PT NotActive", body);
        Assert.DoesNotContain("PT NoFollowUp", body);
    }

    [Fact]
    public async Task Export_CombinesAllFilters()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                Opp(status: "applied", tipe: "Kontrak", followUp: new DateOnly(2026, 11, 14), catatan: ".NET API", perusahaan: "PT Match"),
                Opp(status: "applied", tipe: "FTE", followUp: new DateOnly(2026, 11, 14), catatan: ".NET API", perusahaan: "PT WrongType"),
                Opp(status: "closed", tipe: "Kontrak", followUp: new DateOnly(2026, 11, 14), catatan: ".NET API", perusahaan: "PT WrongStatus"),
            });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, tipe: "Kontrak", q: ".net", followUpOnly: true, today: "2026-11-15"));

        var body = Body(file);
        Assert.Contains("PT Match", body);
        Assert.DoesNotContain("PT WrongType", body);
        Assert.DoesNotContain("PT WrongStatus", body);
    }

    private static Opportunity Opp(
        string status = "new",
        string tipe = "Kontrak",
        string lokasi = "Remote",
        int? skor = null,
        DateOnly? followUp = null,
        string? perusahaan = "PT X",
        string? catatan = null) => new()
    {
        Id = 7,
        Judul = ".NET Developer",
        Perusahaan = perusahaan!,
        Lokasi = lokasi,
        Tipe = tipe,
        Gaji = "15-20jt",
        Skor = skor,
        Status = status,
        FollowUpTanggal = followUp,
        Ditemukan = new DateOnly(2026, 11, 5),
        Link = null,
        Catatan = catatan,
    };

    private static string Body(FileContentResult file)
    {
        var s = Encoding.UTF8.GetString(file.FileContents);
        return s.Length > 0 && s[0] == 0xFEFF ? s.Substring(1) : s;
    }
    [Fact]
    public async Task Export_Pdf_ReturnsPdfFile_WhenFormatIsPdf()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity() });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, format: "pdf"));

        Assert.Equal("application/pdf", file.ContentType);
        Assert.EndsWith(".pdf", file.FileDownloadName);
        Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(file.FileContents));
    }

    [Fact]
    public async Task Export_Pdf_AppliesFilters()
    {
        _repository.Setup(r => r.ListAsync("applied", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity("applied") });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: "applied", format: "pdf"));

        Assert.Contains("Dilamar", Encoding.ASCII.GetString(file.FileContents));
    }

    [Fact]
    public async Task Export_DefaultsToCsv_WhenFormatIsNotPdf()
    {
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Opportunity() });

        var file = Assert.IsType<FileContentResult>(await CreateController().Export(status: null, format: "docx"));

        Assert.Equal("text/csv; charset=utf-8", file.ContentType);
        Assert.EndsWith(".csv", file.FileDownloadName);
    }
}
