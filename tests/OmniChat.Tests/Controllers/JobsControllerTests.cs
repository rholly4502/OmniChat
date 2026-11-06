using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class JobsControllerTests
{
    private readonly Mock<IOpportunityRepository> _repository = new();

    private JobsController CreateController() => new(_repository.Object);

    private static Opportunity Opportunity(string status = "new", string? sourceId = null) => new()
    {
        Id = 1,
        Judul = ".NET Developer",
        Perusahaan = "PT Contoh",
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Status = status,
        Ditemukan = new DateOnly(2026, 11, 5),
        SourceId = sourceId,
    };

    [Fact]
    public async Task List_ReturnsAll_WhenNoStatusFilter()
    {
        var all = new[] { Opportunity("new"), Opportunity("applied") };
        _repository.Setup(r => r.ListAsync(null, It.IsAny<CancellationToken>())).ReturnsAsync(all);

        var result = await CreateController().List(status: null);

        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IReadOnlyList<Opportunity>>(ok.Value);
        Assert.Equal(2, items.Count);
        _repository.Verify(r => r.ListAsync(null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task List_PassesStatusFilterToRepository()
    {
        var filtered = new[] { Opportunity("interview") };
        _repository.Setup(r => r.ListAsync("interview", It.IsAny<CancellationToken>())).ReturnsAsync(filtered);

        var result = await CreateController().List(status: "interview");

        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IReadOnlyList<Opportunity>>(ok.Value);
        Assert.Single(items);
        Assert.Equal("interview", items[0].Status);
        _repository.Verify(r => r.ListAsync("interview", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task List_ReturnsEmpty_WhenNoMatches()
    {
        _repository.Setup(r => r.ListAsync("offer", It.IsAny<CancellationToken>())).ReturnsAsync([]);

        var result = await CreateController().List(status: "offer");

        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IReadOnlyList<Opportunity>>(ok.Value);
        Assert.Empty(items);
    }
}
