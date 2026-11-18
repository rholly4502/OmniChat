using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Data;

/// <summary>EF Core read path for curated job opportunities.</summary>
public sealed class OpportunityRepository(ChatDbContext db) : IOpportunityRepository
{
    public async Task<IReadOnlyList<Opportunity>> ListAsync(
        string? status, CancellationToken cancellationToken)
    {
        var query = db.Opportunities.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(o => o.Status == status);
        }

        return await query
            .OrderByDescending(o => o.Ditemukan)
            .ThenByDescending(o => o.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<Opportunity?> GetByIdAsync(
        long id, CancellationToken cancellationToken)
    {
        return await db.Opportunities
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
    }

    public async Task<int> InsertMissingAsync(
        IEnumerable<Opportunity> opportunities, CancellationToken cancellationToken)
    {
        var list = opportunities.ToList();
        if (list.Count == 0)
        {
            return 0;
        }

        var sourceIds = list
            .Where(o => !string.IsNullOrWhiteSpace(o.SourceId))
            .Select(o => o.SourceId!.Trim())
            .Distinct()
            .ToList();

        var existing = new HashSet<string>();
        if (sourceIds.Count > 0)
        {
            existing = (await db.Opportunities
                    .Where(o => o.SourceId != null && sourceIds.Contains(o.SourceId))
                    .Select(o => o.SourceId!)
                    .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        var missing = list
            .Where(o => string.IsNullOrWhiteSpace(o.SourceId) ||
                        !existing.Contains(o.SourceId!.Trim()))
            .ToList();

        if (missing.Count == 0)
        {
            return 0;
        }

        db.Opportunities.AddRange(missing);
        return await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> UpdateSkorBySourceAsync(
        IReadOnlyDictionary<string, int?> scores, CancellationToken cancellationToken)
    {
        if (scores.Count == 0) return 0;

        var keys = scores.Keys.ToList();
        var rows = await db.Opportunities
            .Where(o => o.SourceId != null && keys.Contains(o.SourceId))
            .ToListAsync(cancellationToken);

        var changed = 0;
        foreach (var row in rows)
        {
            if (row.SourceId is not null && scores.TryGetValue(row.SourceId, out var skor))
            {
                row.Skor = skor;
                changed++;
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        return changed;
    }

    public async Task<bool> UpdateStatusAsync(
        long id, string status, DateOnly today, CancellationToken cancellationToken)
    {
        var opp = await db.Opportunities
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (opp is null)
        {
            return false;
        }

        opp.Status = status;
        // Stamp the date each pipeline stage was first reached (WIB), without
        // overwriting an earlier date when the card moves backward or sideways.
        switch (status)
        {
            case "applied" when opp.DilamarPada is null:
                opp.DilamarPada = today;
                break;
            case "interview" when opp.InterviewPada is null:
                opp.InterviewPada = today;
                break;
            case "offer" when opp.TawaranPada is null:
                opp.TawaranPada = today;
                break;
        }

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateFollowUpAsync(
        long id, DateOnly? tanggal, CancellationToken cancellationToken)
    {
        var opp = await db.Opportunities
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (opp is null)
        {
            return false;
        }

        opp.FollowUpTanggal = tanggal;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<Opportunity> AddAsync(
        Opportunity opportunity, CancellationToken cancellationToken)
    {
        db.Opportunities.Add(opportunity);
        await db.SaveChangesAsync(cancellationToken);
        return opportunity;
    }

    public async Task<bool> UpdateAsync(
        Opportunity opportunity, CancellationToken cancellationToken)
    {
        var existing = await db.Opportunities
            .FirstOrDefaultAsync(o => o.Id == opportunity.Id, cancellationToken);
        if (existing is null)
        {
            return false;
        }

        existing.Judul = opportunity.Judul;
        existing.Perusahaan = opportunity.Perusahaan;
        existing.Lokasi = opportunity.Lokasi;
        existing.Tipe = opportunity.Tipe;
        existing.Gaji = opportunity.Gaji;
        existing.Skor = opportunity.Skor;
        existing.Link = opportunity.Link;
        existing.Catatan = opportunity.Catatan;
        existing.Status = opportunity.Status;
        existing.FollowUpTanggal = opportunity.FollowUpTanggal;
        existing.Ditemukan = opportunity.Ditemukan;
        existing.SourceId = opportunity.SourceId ?? existing.SourceId;

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        var existing = await db.Opportunities
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (existing is null)
        {
            return false;
        }

        db.Opportunities.Remove(existing);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<JobsSummary> JobsSummaryAsync(DateOnly today, CancellationToken cancellationToken)
    {
        // Only the fields we need — avoids loading full rows for an aggregate.
        var rows = await db.Opportunities
            .AsNoTracking()
            .Select(o => new
            {
                o.Id,
                o.Status,
                o.FollowUpTanggal,
                o.Skor,
                o.Judul,
                o.Perusahaan,
                o.Ditemukan,
            })
            .ToListAsync(cancellationToken);

        var perStatus = rows
            .GroupBy(r => r.Status)
            .ToDictionary(g => g.Key, g => g.Count());

        // Follow-up urgency buckets count only open pipeline stages — closed/new
        // opportunities are not actionable follow-up targets (matches the UI's
        // "active stage" rule, so the summary and the Ringkasan card agree).
        var activeFollowUps = rows
            .Where(r => r.Status == "applied" || r.Status == "interview" || r.Status == "offer")
            .Select(r => r.FollowUpTanggal)
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .ToList();

        // Top matches: active (non-closed), scored opportunities, best fit first.
        // Closed roles are out of the running; unscored rows are not a prioritised
        // match. Ties break on more recently found first.
        var topCocok = rows
            .Where(r => r.Status != "closed" && r.Skor.HasValue)
            .OrderByDescending(r => r.Skor)
            .ThenByDescending(r => r.Ditemukan)
            .Take(3)
            .Select(r => new TopOpportunity(r.Id, r.Judul, r.Perusahaan, r.Skor!.Value, r.Status))
            .ToList();

        return new JobsSummary(
            perStatus,
            rows.Count,
            activeFollowUps.Count(d => d < today),
            activeFollowUps.Count(d => d == today),
            activeFollowUps.Count(d => d > today && d <= today.AddDays(7)),
            topCocok);
    }
}
