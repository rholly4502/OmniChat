using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

public class OpportunityRepositoryStageDatesTests
{
    private static (OpportunityRepository repo, ChatDbContext db, string dbPath) Setup()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "jobs-stages-" + Guid.NewGuid().ToString("N") + ".db");
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
        return (new OpportunityRepository(db), db, dbPath);
    }

    [Fact]
    public async Task UpdateStatus_ToApplied_StampsDilamarPadaOnly()
    {
        var (repo, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        var today = new DateOnly(2026, 11, 18);

        Assert.True(await repo.UpdateStatusAsync(id, "applied", today, CancellationToken.None));

        var opp = await db.Opportunities.FirstAsync(o => o.Id == id);
        Assert.Equal("applied", opp.Status);
        Assert.Equal(today, opp.DilamarPada);
        Assert.Null(opp.InterviewPada);
        Assert.Null(opp.TawaranPada);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateStatus_ToInterview_StampsInterviewAndKeepsDilamar()
    {
        var (repo, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        var today = new DateOnly(2026, 11, 18);

        Assert.True(await repo.UpdateStatusAsync(id, "applied", today, CancellationToken.None));
        Assert.True(await repo.UpdateStatusAsync(id, "interview", today.AddDays(2), CancellationToken.None));

        var opp = await db.Opportunities.FirstAsync(o => o.Id == id);
        Assert.Equal("interview", opp.Status);
        Assert.Equal(today, opp.DilamarPada);
        Assert.Equal(today.AddDays(2), opp.InterviewPada);
        Assert.Null(opp.TawaranPada);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateStatus_ToOffer_StampsTawaran()
    {
        var (repo, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        var today = new DateOnly(2026, 11, 18);

        Assert.True(await repo.UpdateStatusAsync(id, "offer", today, CancellationToken.None));

        var opp = await db.Opportunities.FirstAsync(o => o.Id == id);
        Assert.Equal(today, opp.TawaranPada);
        Assert.Null(opp.DilamarPada);
        Assert.Null(opp.InterviewPada);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }

    [Fact]
    public async Task UpdateStatus_MovingBackward_DoesNotClearOrOverwriteStamps()
    {
        var (repo, db, path) = Setup();
        var id = await db.Opportunities.Select(o => o.Id).FirstAsync();
        var today = new DateOnly(2026, 11, 18);

        Assert.True(await repo.UpdateStatusAsync(id, "applied", today, CancellationToken.None));
        Assert.True(await repo.UpdateStatusAsync(id, "interview", today.AddDays(2), CancellationToken.None));
        // Sideways/back to applied again must not overwrite the earlier applied date.
        Assert.True(await repo.UpdateStatusAsync(id, "applied", today.AddDays(5), CancellationToken.None));

        var opp = await db.Opportunities.FirstAsync(o => o.Id == id);
        Assert.Equal("applied", opp.Status);
        Assert.Equal(today, opp.DilamarPada);
        Assert.Equal(today.AddDays(2), opp.InterviewPada);
        db.Dispose(); if (File.Exists(path)) File.Delete(path);
    }
}
