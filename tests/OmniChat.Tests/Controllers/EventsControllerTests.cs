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

    private static EventsController.EventWriteRequest Req(
        string aplikasi = "GoPay", string judul = "Cashback 20%", string ditemukan = "2026-11-14") =>
        new(aplikasi, judul, "Cashback 20%", "Min. transaksi 50rb", "https://gopay.id", "31 Des 2026", ditemukan);

    [Fact]
    public async Task Create_ReturnsCreatedAndPersists()
    {
        var (controller, repo) = Setup();

        var result = await controller.Create(Req(), CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result);
        var item = Assert.IsType<PromoEvent>(created.Value);
        Assert.True(item.Id > 0);
        Assert.Equal("GoPay", item.Aplikasi);
        Assert.Equal("Cashback 20%", item.Judul);
        Assert.StartsWith("web-", item.SourceId);

        var items = await repo.ListAsync(null, CancellationToken.None);
        Assert.Single(items);
        Assert.Equal(item.Id, items[0].Id);
    }

    [Theory]
    [InlineData("", "Cashback 20%", "'aplikasi' wajib diisi.")]
    [InlineData("GoPay", "   ", "'judul' wajib diisi.")]
    public async Task Create_ValidatesRequiredFields(string aplikasi, string judul, string detail)
    {
        var (controller, _) = Setup();

        var result = await controller.Create(Req(aplikasi, judul), CancellationToken.None);

        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
        var problem = Assert.IsType<ProblemDetails>(bad.Value);
        Assert.Equal(detail, problem.Detail);
    }

    [Fact]
    public async Task Create_ValidatesBadDate()
    {
        var (controller, _) = Setup();

        var result = await controller.Create(Req(ditemukan: "not-a-date"), CancellationToken.None);

        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    [Fact]
    public async Task Update_UpdatesExisting()
    {
        var (controller, repo) = Setup();
        var created = await repo.AddAsync(new PromoEvent
        {
            Aplikasi = "GoPay", Judul = "Lama", Ditemukan = new DateOnly(2026, 11, 1), SourceId = "e-x",
        }, CancellationToken.None);

        var result = await controller.Update(created.Id, Req(judul: "Baru"), CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var item = Assert.IsType<PromoEvent>(ok.Value);
        Assert.Equal("Baru", item.Judul);
        Assert.Equal(created.Id, item.Id);
    }

    [Fact]
    public async Task Update_UnknownId_ReturnsNotFound()
    {
        var (controller, _) = Setup();

        var result = await controller.Update(999_999, Req(), CancellationToken.None);

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(404, notFound.StatusCode);
    }

    [Fact]
    public async Task Delete_Deletes()
    {
        var (controller, repo) = Setup();
        var created = await repo.AddAsync(new PromoEvent
        {
            Aplikasi = "OVO", Judul = "Hapus", Ditemukan = new DateOnly(2026, 11, 1), SourceId = "e-y",
        }, CancellationToken.None);

        var result = await controller.Delete(created.Id, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Null(await repo.GetByIdAsync(created.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Delete_UnknownId_ReturnsNotFound()
    {
        var (controller, _) = Setup();

        var result = await controller.Delete(999_999, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }
}
