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

    private static PromoEvent NewEvent(long id, string aplikasi, string? berlakuSampai = null, bool dipakai = false) => new()
    {
        Id = id,
        Aplikasi = aplikasi,
        Judul = $"Promo {id}",
        BerlakuSampai = berlakuSampai,
        Dipakai = dipakai,
        Ditemukan = new DateOnly(2026, 11, 1),
    };

    private async Task SeedAsync(params PromoEvent[] rows)
    {
        await _db.PromoEvents.AddRangeAsync(rows);
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Summary_counts_totals_unique_sources_expiry_buckets_used_and_remaining_active()
    {
        var today = new DateOnly(2026, 11, 16);
        await SeedAsync(
            NewEvent(1, "OVO", "2026-11-16"),    // ends today -> active
            NewEvent(2, "OVO", "2026-11-17"),    // ends tomorrow -> active
            NewEvent(3, "GoPay", "2026-11-19"),  // within 7 days -> active
            NewEvent(4, "GoPay", "2026-12-16", dipakai: true),   // beyond 7 days -> active but used
            NewEvent(5, "OVO", "2026-11-13", dipakai: true),     // expired and used
            NewEvent(6, "DANA"),                 // no end date -> active
            NewEvent(7, "DANA", "31 Okt 2026")); // free-text -> active (not a YYYY-MM-DD date)

        var summary = await _repository.EventsSummaryAsync(today, CancellationToken.None);

        Assert.Equal(7, summary.Total);
        Assert.Equal(3, summary.SumberUnik); // OVO, GoPay, DANA
        Assert.Equal(1, summary.BerakhirHariIni);
        Assert.Equal(1, summary.BesokBerakhir);
        Assert.Equal(1, summary.Dalam7Hari);
        Assert.Equal(1, summary.SudahBerakhir); // 2026-11-13 expired
        Assert.Equal(2, summary.TotalDipakai);  // events 4 and 5
        Assert.Equal(5, summary.SisaAktif);     // 6 active minus event 4 (used)
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
        Assert.Equal(0, summary.SudahBerakhir);
        Assert.Equal(0, summary.TotalDipakai);
        Assert.Equal(0, summary.SisaAktif);
    }
}
