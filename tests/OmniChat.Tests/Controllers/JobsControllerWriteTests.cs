using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class JobsControllerWriteTests
{
    private readonly Mock<IOpportunityRepository> _repository = new();

    private JobsController CreateController() => new(_repository.Object, new Mock<ILamaranDraftService>().Object, new Mock<IJobsPdfReport>().Object);

    private static JobWriteRequest Req(
        string judul = ".NET Developer",
        string perusahaan = "PT Contoh",
        string lokasi = "Remote",
        string tipe = "Kontrak",
        string ditemukan = "2026-11-14",
        string? status = null) =>
        new(judul, perusahaan, lokasi, tipe, "15-20jt", null, "https://contoh.dev/lowongan", "catatan", status, null, ditemukan);

    private static Opportunity Created() => new()
    {
        Id = 10,
        Judul = ".NET Developer",
        Perusahaan = "PT Contoh",
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Status = "new",
        Ditemukan = new DateOnly(2026, 11, 14),
        SourceId = "web-abcdef12",
    };

    [Fact]
    public async Task Create_ReturnsCreatedAndPersists()
    {
        _repository.Setup(r => r.AddAsync(It.IsAny<Opportunity>(), It.IsAny<CancellationToken>())).ReturnsAsync(Created());

        var result = await CreateController().Create(Req(), CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result);
        var item = Assert.IsType<Opportunity>(created.Value);
        Assert.Equal(10, item.Id);
        _repository.Verify(r => r.AddAsync(It.Is<Opportunity>(o => o.SourceId != null && o.SourceId.StartsWith("web-")), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData("", "PT Contoh", "Remote")]
    [InlineData(".NET Developer", "", "Remote")]
    [InlineData(".NET Developer", "PT Contoh", "")]
    public async Task Create_ValidatesRequiredFields(string judul, string perusahaan, string lokasi)
    {
        var result = await CreateController().Create(Req(judul, perusahaan, lokasi), CancellationToken.None);

        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
        Assert.NotNull(bad.Value);
    }

    [Fact]
    public async Task Create_ValidatesBadDateAndBadStatus()
    {
        var badDate = await CreateController().Create(Req(ditemukan: "not-a-date"), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(badDate);

        var badStatus = await CreateController().Create(Req(status: "bogus"), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(badStatus);
    }

    [Fact]
    public async Task Update_UpdatesExisting_ReturnsUpdated()
    {
        _repository.Setup(r => r.UpdateAsync(It.IsAny<Opportunity>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _repository.Setup(r => r.GetByIdAsync(10, It.IsAny<CancellationToken>())).ReturnsAsync(Created());

        var result = await CreateController().Update(10, Req(), CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var item = Assert.IsType<Opportunity>(ok.Value);
        Assert.Equal(10, item.Id);
        _repository.Verify(r => r.UpdateAsync(It.Is<Opportunity>(o => o.Id == 10), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Update_UnknownId_ReturnsNotFound()
    {
        _repository.Setup(r => r.UpdateAsync(It.IsAny<Opportunity>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await CreateController().Update(999_999, Req(), CancellationToken.None);

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(404, notFound.StatusCode);
    }

    [Fact]
    public async Task Delete_Deletes()
    {
        _repository.Setup(r => r.DeleteAsync(10, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await CreateController().Delete(10, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.Verify(r => r.DeleteAsync(10, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Delete_UnknownId_ReturnsNotFound()
    {
        _repository.Setup(r => r.DeleteAsync(999_999, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await CreateController().Delete(999_999, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }
}
