using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for <see cref="PromoEventRepository.EventsSummaryAsync"/> against a real
/// in-memory SQLite database.
/// </summary>
public sealed class PromoEventRepositorySummaryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly PromoEventRepository _repository;

    public PromoEventRepositorySummaryTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options);
        _db.Database.EnsureCreated();
        _repository = new PromoEventRepository(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static PromoEvent NewEvent(long id, string aplikasi, string? berlakuSampai = null) => new()
    {
        Id = id,
        Aplikasi = aplikasi,
        Judul = $"Promo {id}",
        BerlakuSampai = berlakuSampai,
        Ditemukan = new DateOnly(2026, 11, 1),
    };

    private async Task SeedAsync(params PromoEvent[] rows)
    {
        await _db.PromoEvents.AddRangeAsync(rows);
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Summary_counts_totals_unique_sources_and_expiry_buckets_relative_to_today()
    {
        var today = new DateOnly(2026, 11, 16);
        await SeedAsync(
            NewEvent(1, "OVO", "2026-11-16"),    // ends today
            NewEvent(2, "OVO", "2026-11-17"),    // ends tomorrow
            NewEvent(3, "GoPay", "2026-11-19"),  // within 7 days
            NewEvent(4, "GoPay", "2026-12-16"),  // beyond 7 days
            NewEvent(5, "OVO", "2026-11-13"),    // expired -> not actionable
            NewEvent(6, "DANA"),                 // no end date
            NewEvent(7, "DANA", "31 Okt 2026")); // free-text -> not a YYYY-MM-DD date

        var summary = await _repository.EventsSummaryAsync(today, CancellationToken.None);

        Assert.Equal(7, summary.Total);
        Assert.Equal(3, summary.SumberUnik); // OVO, GoPay, DANA
        Assert.Equal(1, summary.BerakhirHariIni);
        Assert.Equal(1, summary.BesokBerakhir);
        Assert.Equal(1, summary.Dalam7Hari);
    }

    [Fact]
    public async Task Summary_returns_zero_counts_when_no_rows()
    {
        var summary = await _repository.EventsSummaryAsync(new DateOnly(2026, 11, 16), CancellationToken.None);

        Assert.Equal(0, summary.Total);
        Assert.Equal(0, summary.SumberUnik);
        Assert.Equal(0, summary.BerakhirHariIni);
        Assert.Equal(0, summary.BesokBerakhir);
        Assert.Equal(0, summary.Dalam7Hari);
    }
}
