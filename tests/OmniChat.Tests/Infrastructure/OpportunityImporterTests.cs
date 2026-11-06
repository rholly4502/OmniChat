using Microsoft.EntityFrameworkCore;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Infrastructure;

public class OpportunityImporterTests
{
    private static string WriteTempOpportunities(int count)
    {
        var dir = Path.Combine(Path.GetTempPath(), "opp-import-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var items = Enumerable.Range(1, count).Select(i => new
        {
            id = $"test-{i}",
            judul = $"Lowongan {i}",
            perusahaan = $"PT Test {i}",
            lokasi = "Remote",
            tipe = "Kontrak",
            gaji = "Rp10 jt",
            link = $"https://example.com/{i}",
            catatan = "",
            status = "new",
            ditemukan = "2026-11-06",
        });
        var json = System.Text.Json.JsonSerializer.Serialize(items, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(dir, "opportunities.json"), json);
        return dir;
    }

    [Fact]
    public async Task ImportFileAsync_InsertsNewRows_AndSkipsDuplicates()
    {
        var dir = WriteTempOpportunities(5);
        var dbPath = Path.Combine(Path.GetTempPath(), "opp-import-db-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<ChatDbContext>().UseSqlite($"Data Source={dbPath}").Options;
        using (var db = new ChatDbContext(options))
        {
            await db.Database.MigrateAsync();
        }

        using (var db = new ChatDbContext(options))
        {
            var importer = new OpportunityImporter(new OpportunityRepository(db));
            var r1 = await importer.ImportFileAsync(dir, CancellationToken.None);
            Assert.Equal(5, r1.Inserted);
            Assert.Empty(r1.Skipped);

            var r2 = await importer.ImportFileAsync(dir, CancellationToken.None);
            Assert.Equal(0, r2.Inserted);

            var listed = await new OpportunityRepository(db).ListAsync(null, CancellationToken.None);
            Assert.Equal(5, listed.Count);
        }

        Directory.Delete(dir, recursive: true);
        if (File.Exists(dbPath)) File.Delete(dbPath);
    }
}

