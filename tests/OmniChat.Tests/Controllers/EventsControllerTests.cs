using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Data;
using OmniChat.Domain.Entities;

namespace OmniChat.Tests.Controllers;

public class EventsControllerTests
{
    private static (EventsController controller, IPromoEventRepository repo) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "events-ctrl-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        using (var db = new ChatDbContext(options))
        {
            db.Database.EnsureCreated();
        }
        var db2 = new ChatDbContext(options);
        var repo = new PromoEventRepository(db2);
        return (new EventsController(repo), repo);
    }

    [Fact]
    public async Task List_ReturnsAllEvents_NewestFirst()
    {
        var (controller, repo) = Setup();
        await repo.InsertMissingAsync(new[]
        {
            new PromoEvent { Aplikasi = "GoPay", Judul = "Event B", Ditemukan = new DateOnly(2026, 10, 20), SourceId = "e-b" },
            new PromoEvent { Aplikasi = "OVO", Judul = "Event A", Ditemukan = new DateOnly(2026, 10, 21), SourceId = "e-a" },
        }, CancellationToken.None);

        var result = await controller.List(null, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IReadOnlyList<PromoEvent>>(ok.Value);
        Assert.Equal(2, items.Count);
        Assert.Equal("Event A", items[0].Judul); // newest first
    }

    [Fact]
    public async Task List_FiltersByApp()
    {
        var (controller, repo) = Setup();
        await repo.InsertMissingAsync(new[]
        {
            new PromoEvent { Aplikasi = "GoPay", Judul = "E1", Ditemukan = new DateOnly(2026, 10, 20), SourceId = "e-1" },
            new PromoEvent { Aplikasi = "DANA", Judul = "E2", Ditemukan = new DateOnly(2026, 10, 20), SourceId = "e-2" },
        }, CancellationToken.None);

        var result = await controller.List("GoPay", CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IReadOnlyList<PromoEvent>>(ok.Value);
        Assert.Single(items);
        Assert.Equal("GoPay", items[0].Aplikasi);
    }
}
