using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

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
}
