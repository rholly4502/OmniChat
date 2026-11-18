using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for <see cref="OpportunityRepository.JobsSummaryAsync"/> against a real
/// in-memory SQLite database.
/// </summary>
public sealed class OpportunityRepositorySummaryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly OpportunityRepository _repository;

    public OpportunityRepositorySummaryTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _db = new ChatDbContext(new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options);
        _db.Database.EnsureCreated();
        _repository = new OpportunityRepository(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static Opportunity NewOpportunity(
        long id, string status, DateOnly? followUp = null, int? skor = null) => new()
    {
        Id = id,
        Judul = $".NET Developer {id}",
        Perusahaan = "PT Contoh",
        Lokasi = "Remote",
        Tipe = "Kontrak",
        Status = status,
        FollowUpTanggal = followUp,
        Skor = skor,
        Ditemukan = new DateOnly(2026, 11, 1),
    };

    private async Task SeedAsync(params Opportunity[] rows)
    {
        await _db.Opportunities.AddRangeAsync(rows);
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Summary_groups_by_status_and_buckets_followups_relative_to_today()
    {
        var today = new DateOnly(2026, 11, 16);
        await SeedAsync(
            NewOpportunity(1, "new"),
            NewOpportunity(2, "applied", new DateOnly(2026, 11, 15)), // overdue
            NewOpportunity(3, "applied", new DateOnly(2026, 11, 16)), // today
            NewOpportunity(4, "interview", new DateOnly(2026, 11, 20)), // within 7d
            NewOpportunity(5, "offer", new DateOnly(2026, 12, 1)),     // beyond 7d
            NewOpportunity(6, "closed"),
            // Non-actionable stages carry follow-up dates but must NOT count:
            // closed/new are not open pipeline stages, so their targets are
            // excluded from the urgency buckets (matches the Ringkasan card).
            NewOpportunity(7, "closed", new DateOnly(2026, 11, 15)),
            NewOpportunity(8, "new", new DateOnly(2026, 11, 16)));

        var summary = await _repository.JobsSummaryAsync(today, CancellationToken.None);

        Assert.Equal(8, summary.Total);
        Assert.Equal(2, summary.PerStatus["new"]);
        Assert.Equal(2, summary.PerStatus["applied"]);
        Assert.Equal(1, summary.PerStatus["interview"]);
        Assert.Equal(1, summary.PerStatus["offer"]);
        Assert.Equal(2, summary.PerStatus["closed"]);
        Assert.Equal(1, summary.FollowUpTerlambat);
        Assert.Equal(1, summary.FollowUpHariIni);
        Assert.Equal(1, summary.FollowUp7Hari);
    }

    [Fact]
    public async Task Summary_returns_zero_counts_when_no_rows()
    {
        var summary = await _repository.JobsSummaryAsync(new DateOnly(2026, 11, 16), CancellationToken.None);

        Assert.Equal(0, summary.Total);
        Assert.Empty(summary.PerStatus);
        Assert.Equal(0, summary.FollowUpTerlambat);
        Assert.Equal(0, summary.FollowUpHariIni);
        Assert.Equal(0, summary.FollowUp7Hari);
        Assert.Empty(summary.TopCocok);
    }

    [Fact]
    public async Task Summary_returns_top_scored_active_opportunities()
    {
        var today = new DateOnly(2026, 11, 16);
        await SeedAsync(
            NewOpportunity(1, "new", skor: 70),
            NewOpportunity(2, "applied", skor: 95),   // best active
            NewOpportunity(3, "new", skor: 88),        // second
            NewOpportunity(4, "interview", skor: 82),  // third
            NewOpportunity(5, "new", skor: 91),        // would be 2nd, but 3 slots: still included (top3)
            NewOpportunity(6, "closed", skor: 99),     // excluded: closed
            NewOpportunity(7, "applied", skor: null)); // excluded: unscored

        var summary = await _repository.JobsSummaryAsync(today, CancellationToken.None);

        // Closed (99) and unscored are excluded; top 3 active by score desc:
        // 95 (id 2), 91 (id 5), 88 (id 3).
        var tops = summary.TopCocok;
        Assert.Equal(3, tops.Count);
        Assert.Equal(95, tops[0].Skor);
        Assert.Equal(2, tops[0].Id);
        Assert.Equal(91, tops[1].Skor);
        Assert.Equal(5, tops[1].Id);
        Assert.Equal(88, tops[2].Skor);
        Assert.Equal(3, tops[2].Id);
        Assert.Equal("applied", tops[0].Status);
        Assert.Equal("new", tops[1].Status);
        Assert.Equal("new", tops[2].Status);
    }

    [Fact]
    public async Task Summary_top_matches_empty_when_all_closed_or_unscored()
    {
        await SeedAsync(
            NewOpportunity(1, "closed", skor: 90),
            NewOpportunity(2, "new", skor: null));

        var summary = await _repository.JobsSummaryAsync(new DateOnly(2026, 11, 16), CancellationToken.None);

        Assert.Empty(summary.TopCocok);
    }
}
