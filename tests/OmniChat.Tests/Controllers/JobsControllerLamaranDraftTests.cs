using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Controllers;

public class JobsControllerLamaranDraftTests
{
    private static (JobsController controller, ChatDbContext db, string dbPath, Mock<ILamaranDraftService> service) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "jobs-draft-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        ChatDbContext db;
        using (var seed = new ChatDbContext(options))
        {
            seed.Database.EnsureCreated();
            seed.Opportunities.Add(new Opportunity
            {
                Judul = ".NET Developer",
                Perusahaan = "PT Contoh",
                Lokasi = "Remote",
                Tipe = "Kontrak",
                Status = "new",
                Ditemukan = new DateOnly(2026, 11, 5),
                SourceId = "s-1",
            });
            seed.SaveChanges();
        }
        db = new ChatDbContext(options);
        var service = new Mock<ILamaranDraftService>();
        return (new JobsController(new OpportunityRepository(db), service.Object), db, dbPath, service);
    }

    [Fact]
    public async Task Generate_ReturnsDraft_WhenServiceFindsOpportunity()
    {
        var (controller, db, path, service) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        var draft = new LamaranDraft("Subject: Application for .NET Developer at PT Contoh\n\nDear Hiring Manager,\n\n...", "hermes");
        service.Setup(s => s.GenerateAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(draft);

        var result = await controller.GenerateLamaranDraft(id, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsAssignableFrom<LamaranDraft>(ok.Value);
        Assert.Contains("Application for .NET Developer", body.CoverLetter);
        service.Verify(s => s.GenerateAsync(id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Generate_Returns404_WhenServiceReturnsNull()
    {
        var (controller, db, path, service) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        service.Setup(s => s.GenerateAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync((LamaranDraft?)null);

        var result = await controller.GenerateLamaranDraft(id, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Generate_Returns502_WhenGatewayFails()
    {
        var (controller, db, path, service) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        service.Setup(s => s.GenerateAsync(id, It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException("gateway down"));

        var result = await controller.GenerateLamaranDraft(id, CancellationToken.None);

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, status.StatusCode);
    }
}
