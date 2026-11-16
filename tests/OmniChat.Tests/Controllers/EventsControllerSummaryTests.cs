using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Controllers;

public class EventsControllerSummaryTests
{
    private readonly Mock<IPromoEventRepository> _repository = new();

    private EventsController CreateController() => new(_repository.Object);

    private static EventsSummary Summary() => new(
        Total: 7,
        SumberUnik: 3,
        BerakhirHariIni: 1,
        BesokBerakhir: 1,
        Dalam7Hari: 1,
        SudahBerakhir: 2);

    [Fact]
    public async Task Summary_ReturnsOk_WithRepositorySummary()
    {
        _repository.Setup(r => r.EventsSummaryAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Summary());

        var result = await CreateController().Summary(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsType<EventsSummary>(ok.Value);
        Assert.Equal(7, body.Total);
        Assert.Equal(3, body.SumberUnik);
        Assert.Equal(1, body.BerakhirHariIni);
        Assert.Equal(1, body.BesokBerakhir);
        Assert.Equal(1, body.Dalam7Hari);
        Assert.Equal(2, body.SudahBerakhir);
    }
}
