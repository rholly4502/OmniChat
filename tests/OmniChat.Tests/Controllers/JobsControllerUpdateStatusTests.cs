using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniChat.Api.Controllers;
using OmniChat.Infrastructure.Data;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class JobsControllerUpdateStatusTests
{
    private static (JobsController controller, ChatDbContext db, string dbPath) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "jobs-status-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        ChatDbContext db;
        using (var seed = new ChatDbContext(options))
        {
            seed.Database.EnsureCreated();
            seed.Opportunities.Add(new Opportunity
            {
                Judul = "X", Perusahaan = "Y", Lokasi = "Remote",
                Tipe = "FTE", Status = "new", Ditemukan = new DateOnly(2026, 10, 1),
                SourceId = "s-1",
            });
            seed.SaveChanges();
        }
        db = new ChatDbContext(options);
        return (new JobsController(new OpportunityRepository(db)), db, dbPath);
    }

    [Fact]
    public async Task UpdateStatus_ValidStatus_ReturnsNoContent_AndPersists()
    {
        var (controller, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();

        var result = await controller.UpdateStatus(id, new UpdateOpportunityStatusRequest("applied"), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var updated = await db.Opportunities.Where(o => o.Id == id).Select(o => o.Status).FirstAsync();
        Assert.Equal("applied", updated);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateStatus_InvalidStatus_ReturnsBadRequest()
    {
        var (controller, db, path) = Setup();
        var result = await controller.UpdateStatus(1, new UpdateOpportunityStatusRequest("bogus"), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateStatus_UnknownId_ReturnsNotFound()
    {
        var (controller, db, path) = Setup();
        var result = await controller.UpdateStatus(99999, new UpdateOpportunityStatusRequest("applied"), CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }
}
