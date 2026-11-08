using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>EF Core read path for curated promo events.</summary>
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
}
