using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniChat.Api.Controllers;
using OmniChat.Infrastructure.Data;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class EventsControllerDipakaiTests
{
    private static (EventsController controller, ChatDbContext db, string dbPath) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "events-dipakai-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        ChatDbContext db;
        using (var seed = new ChatDbContext(options))
        {
            seed.Database.EnsureCreated();
            seed.PromoEvents.Add(new PromoEvent
            {
                Aplikasi = "GoPay",
                Judul = "Cashback 50%",
                Ditemukan = new DateOnly(2026, 10, 1),
                SourceId = "s-1",
            });
            seed.SaveChanges();
        }
        db = new ChatDbContext(options);
        return (new EventsController(new PromoEventRepository(db)), db, dbPath);
    }

    [Fact]
    public async Task SetDipakai_True_Persists()
    {
        var (controller, db, path) = Setup();
        var id = await db.PromoEvents.Select(e => e.Id).FirstAsync();

        var result = await controller.SetDipakai(id, new EventsController.DipakaiRequest(true), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var dipakai = await db.PromoEvents.Where(e => e.Id == id).Select(e => e.Dipakai).FirstAsync();
        Assert.True(dipakai);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task SetDipakai_False_Clears()
    {
        var (controller, db, path) = Setup();
        var id = await db.PromoEvents.Select(e => e.Id).FirstAsync();
        await controller.SetDipakai(id, new EventsController.DipakaiRequest(true), CancellationToken.None);

        var result = await controller.SetDipakai(id, new EventsController.DipakaiRequest(false), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var dipakai = await db.PromoEvents.Where(e => e.Id == id).Select(e => e.Dipakai).FirstAsync();
        Assert.False(dipakai);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task SetDipakai_UnknownId_ReturnsNotFound()
    {
        var (controller, db, path) = Setup();
        var result = await controller.SetDipakai(99999, new EventsController.DipakaiRequest(true), CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }
}
