using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for <see cref="ExpenseImporter"/>: CSV parsing, target.json import, and the
/// idempotency guarantee (re-running never duplicates rows).
/// </summary>
public sealed class ExpenseImporterTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly ExpenseRepository _repository;
    private readonly ExpenseImporter _importer;

    public ExpenseImporterTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options);
        _db.Database.EnsureCreated();
        _repository = new ExpenseRepository(_db);
        _importer = new ExpenseImporter(_repository);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static string WriteLedger(string baseDir, string csv, string targetJson = "{}")
    {
        Directory.CreateDirectory(baseDir);
        File.WriteAllText(Path.Combine(baseDir, "2026-10.csv"), csv);
        File.WriteAllText(Path.Combine(baseDir, "target.json"), targetJson);
        return baseDir;
    }

    [Fact]
    public async Task Import_reads_expenses_and_targets()
    {
        var dir = WriteLedger(
            Path.Combine(Path.GetTempPath(), "imp-" + Guid.NewGuid().ToString("N")),
            """
            tanggal,waktu,kategori,keterangan,nominal,id
            2026-10-28,12:30,Makan,Warteg,20000,a1b2c3
            2026-10-29,09:10,Belanja,Belanja bulanan,300000,a1b2e5
            """,
            """{"2026-10": {"target_nabung": 467000, "anggaran": 520000}}""");

        try
        {
            var result = await _importer.ImportDirectoryAsync(dir, CancellationToken.None);

            Assert.Equal(2, result.ExpensesInserted);
            Assert.Equal(1, result.TargetsUpserted);
            Assert.Empty(result.SkippedLines);

            var totals = await _repository.GetTotalsAsync("2026-10", CancellationToken.None);
            Assert.Equal(320_000, totals.Total);

            var target = await _repository.GetTargetAsync("2026-10", CancellationToken.None);
            Assert.NotNull(target);
            Assert.Equal(467_000, target.TargetNabung);
            Assert.Equal(520_000, target.Anggaran);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task Import_is_idempotent_on_second_run()
    {
        var dir = WriteLedger(
            Path.Combine(Path.GetTempPath(), "imp-" + Guid.NewGuid().ToString("N")),
            "tanggal,waktu,kategori,keterangan,nominal,id\n2026-10-28,12:30,Makan,Warteg,20000,a1b2c3\n");

        try
        {
            var first = await _importer.ImportDirectoryAsync(dir, CancellationToken.None);
            var second = await _importer.ImportDirectoryAsync(dir, CancellationToken.None);

            Assert.Equal(1, first.ExpensesInserted);
            Assert.Equal(0, second.ExpensesInserted);
            Assert.Equal(1, _db.Expenses.Count());
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task Import_keeps_keterangan_with_embedded_commas()
    {
        var dir = WriteLedger(
            Path.Combine(Path.GetTempPath(), "imp-" + Guid.NewGuid().ToString("N")),
            """
            tanggal,waktu,kategori,keterangan,nominal,id
            2026-10-28,12:30,Lain,"Minum kopi, teh, dan susu",45000,a1b2c4
            """);

        try
        {
            await _importer.ImportDirectoryAsync(dir, CancellationToken.None);
            var row = (await _repository.ListAsync("2026-10", 1, 50, CancellationToken.None)).Single();
            Assert.Equal("Minum kopi, teh, dan susu", row.Keterangan);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task Import_reports_bad_lines_instead_of_silently_dropping_them()
    {
        var dir = WriteLedger(
            Path.Combine(Path.GetTempPath(), "imp-" + Guid.NewGuid().ToString("N")),
            """
            tanggal,waktu,kategori,keterangan,nominal,id
            2026-13-40,12:30,Makan,Bad date,20000,a1b2c3
            2026-10-28,12:30,Makan,Bad nominal,abc,a1b2c4
            """);

        try
        {
            var result = await _importer.ImportDirectoryAsync(dir, CancellationToken.None);

            Assert.Equal(0, result.ExpensesInserted);
            Assert.Equal(2, result.SkippedLines.Count);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task Import_throws_when_directory_missing()
    {
        await Assert.ThrowsAsync<DirectoryNotFoundException>(
            () => _importer.ImportDirectoryAsync("/nonexistent/ledger", CancellationToken.None));
    }
}
