using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniChat.Api.Controllers;
using OmniChat.Infrastructure.Data;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class JobsControllerFollowUpTests
{
    private static (JobsController controller, ChatDbContext db, string dbPath) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "jobs-followup-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        ChatDbContext db;
        using (var seed = new ChatDbContext(options))
        {
            seed.Database.EnsureCreated();
            seed.Opportunities.Add(new Opportunity
            {
                Judul = "X", Perusahaan = "Y", Lokasi = "Remote",
                Tipe = "FTE", Status = "applied", Ditemukan = new DateOnly(2026, 10, 1),
                SourceId = "s-1",
            });
            seed.SaveChanges();
        }
        db = new ChatDbContext(options);
        return (new JobsController(new OpportunityRepository(db)), db, dbPath);
    }

    [Fact]
    public async Task UpdateFollowUp_ValidDate_Persists()
    {
        var (controller, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();

        var result = await controller.UpdateFollowUp(id, new UpdateOpportunityFollowUpRequest("2026-11-20"), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var tanggal = await db.Opportunities.Where(o => o.Id == id).Select(o => o.FollowUpTanggal).FirstAsync();
        Assert.Equal(new DateOnly(2026, 11, 20), tanggal);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateFollowUp_Null_Clears()
    {
        var (controller, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        await controller.UpdateFollowUp(id, new UpdateOpportunityFollowUpRequest("2026-11-20"), CancellationToken.None);

        var result = await controller.UpdateFollowUp(id, new UpdateOpportunityFollowUpRequest(null), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var tanggal = await db.Opportunities.Where(o => o.Id == id).Select(o => o.FollowUpTanggal).FirstAsync();
        Assert.Null(tanggal);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateFollowUp_MalformedDate_ReturnsBadRequest()
    {
        var (controller, db, path) = Setup();
        var result = await controller.UpdateFollowUp(1, new UpdateOpportunityFollowUpRequest("bukan-tanggal"), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateFollowUp_UnknownId_ReturnsNotFound()
    {
        var (controller, db, path) = Setup();
        var result = await controller.UpdateFollowUp(99999, new UpdateOpportunityFollowUpRequest("2026-11-20"), CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }
}
