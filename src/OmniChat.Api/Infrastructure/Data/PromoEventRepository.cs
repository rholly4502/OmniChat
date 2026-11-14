using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>EF Core read/write path for curated promo events.</summary>
public sealed class PromoEventRepository(ChatDbContext db) : IPromoEventRepository
{
    public async Task<IReadOnlyList<PromoEvent>> ListAsync(
        string? aplikasi, CancellationToken cancellationToken)
    {
        var query = db.PromoEvents.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(aplikasi))
        {
            query = query.Where(e => e.Aplikasi == aplikasi);
        }

        return await query
            .OrderByDescending(e => e.Ditemukan)
            .ThenByDescending(e => e.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<int> InsertMissingAsync(
        IEnumerable<PromoEvent> events, CancellationToken cancellationToken)
    {
        var list = events.ToList();
        if (list.Count == 0)
        {
            return 0;
        }

        var sourceIds = list
            .Where(e => !string.IsNullOrWhiteSpace(e.SourceId))
            .Select(e => e.SourceId!.Trim())
            .Distinct()
            .ToList();

        var existing = new HashSet<string>();
        if (sourceIds.Count > 0)
        {
            existing = (await db.PromoEvents
                    .Where(e => e.SourceId != null && sourceIds.Contains(e.SourceId))
                    .Select(e => e.SourceId!)
                    .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        var missing = list
            .Where(e => string.IsNullOrWhiteSpace(e.SourceId) ||
                        !existing.Contains(e.SourceId!.Trim()))
            .ToList();

        if (missing.Count == 0)
        {
            return 0;
        }

        db.PromoEvents.AddRange(missing);
        return await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<PromoEvent?> GetByIdAsync(
        long id, CancellationToken cancellationToken) =>
        await db.PromoEvents.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

    public async Task<PromoEvent> AddAsync(
        PromoEvent @event, CancellationToken cancellationToken)
    {
        db.PromoEvents.Add(@event);
        await db.SaveChangesAsync(cancellationToken);
        return @event;
    }

    public async Task<bool> UpdateAsync(
        PromoEvent @event, CancellationToken cancellationToken)
    {
        var existing = await db.PromoEvents.FirstOrDefaultAsync(e => e.Id == @event.Id, cancellationToken);
        if (existing is null)
        {
            return false;
        }

        existing.Aplikasi = @event.Aplikasi;
        existing.Judul = @event.Judul;
        existing.Benefit = @event.Benefit;
        existing.Syarat = @event.Syarat;
        existing.Link = @event.Link;
        existing.BerlakuSampai = @event.BerlakuSampai;
        existing.Ditemukan = @event.Ditemukan;
        existing.SourceId = @event.SourceId ?? existing.SourceId;

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        var existing = await db.PromoEvents.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
        if (existing is null)
        {
            return false;
        }

        db.PromoEvents.Remove(existing);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
