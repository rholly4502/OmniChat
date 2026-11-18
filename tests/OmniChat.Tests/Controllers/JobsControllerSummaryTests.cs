using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Controllers;

public class JobsControllerSummaryTests
{
    private readonly Mock<IOpportunityRepository> _repository = new();

    private JobsController CreateController() => new(_repository.Object, new Mock<ILamaranDraftService>().Object);

    private static JobsSummary Summary() => new(
        PerStatus: new Dictionary<string, int>
        {
            ["new"] = 3,
            ["applied"] = 2,
        },
        Total: 5,
        FollowUpTerlambat: 1,
        FollowUpHariIni: 1,
        FollowUp7Hari: 2,
        TopCocok: new[]
        {
            new TopOpportunity(4, ".NET Developer", "PT Contoh", 88),
        });

    [Fact]
    public async Task Summary_ReturnsOk_WithRepositorySummary()
    {
        _repository.Setup(r => r.JobsSummaryAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Summary());

        var result = await CreateController().Summary(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsType<JobsSummary>(ok.Value);
        Assert.Equal(5, body.Total);
        Assert.Equal(2, body.PerStatus["applied"]);
        Assert.Equal(2, body.FollowUp7Hari);
        var top = Assert.Single(body.TopCocok);
        Assert.Equal(88, top.Skor);
        Assert.Equal(".NET Developer", top.Judul);
    }
}
