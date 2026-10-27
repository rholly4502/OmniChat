using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// EF Core implementation of <see cref="IExpenseRepository"/> over <see cref="ChatDbContext"/>.
/// </summary>
public sealed class ExpenseRepository(ChatDbContext db) : IExpenseRepository
{
    /// <summary>Largest page of transactions a read can return.</summary>
    public const int MaxPageSize = 200;

    /// <summary>Smallest page of transactions a read can return.</summary>
    public const int MinPageSize = 1;

    /// <summary>Default page of transactions when the caller omits the parameter.</summary>
    public const int DefaultPageSize = 50;

    public async Task<IReadOnlyList<Expense>> ListAsync(
        string month, int page, int pageSize, CancellationToken cancellationToken)
    {
        var (from, toExclusive) = MonthRange(month);
        var safePage = Math.Max(1, page);
        var safeSize = Math.Clamp(pageSize, MinPageSize, MaxPageSize);

        return await db.Expenses
            .AsNoTracking()
            .Where(e => e.Tanggal >= from && e.Tanggal < toExclusive)
            .OrderByDescending(e => e.Tanggal)
            .ThenByDescending(e => e.Id)
            .Skip((safePage - 1) * safeSize)
            .Take(safeSize)
            .ToListAsync(cancellationToken);
    }

    public Task<int> CountAsync(string month, CancellationToken cancellationToken)
    {
        var (from, toExclusive) = MonthRange(month);
        return db.Expenses
            .AsNoTracking()
            .CountAsync(e => e.Tanggal >= from && e.Tanggal < toExclusive, cancellationToken);
    }

    public async Task<(long Total, IReadOnlyDictionary<string, long> PerKategori)> GetTotalsAsync(
        string month, CancellationToken cancellationToken)
    {
        var (from, toExclusive) = MonthRange(month);

        var rows = await db.Expenses
            .AsNoTracking()
            .Where(e => e.Tanggal >= from && e.Tanggal < toExclusive)
            .GroupBy(e => e.Kategori)
            .Select(g => new { Kategori = g.Key, Total = g.Sum(e => e.Nominal) })
            .ToListAsync(cancellationToken);

        var perKategori = rows.ToDictionary(r => r.Kategori, r => r.Total);
        return (perKategori.Values.Sum(), perKategori);
    }

    public Task<ExpenseTarget?> GetTargetAsync(string month, CancellationToken cancellationToken) =>
        db.ExpenseTargets
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Month == month, cancellationToken);

    public async Task<int> InsertMissingExpensesAsync(
        IEnumerable<Expense> expenses, CancellationToken cancellationToken)
    {
        var list = expenses.ToList();
        if (list.Count == 0)
        {
            return 0;
        }

        // Deduplicate by SourceId. Null/blank SourceId rows cannot be deduplicated, so they
        // are inserted as-is on every run (the ledger always carries an id in practice).
        var sourceIds = list
            .Where(e => !string.IsNullOrWhiteSpace(e.SourceId))
            .Select(e => e.SourceId!.Trim())
            .Distinct()
            .ToList();

        var existing = new HashSet<string>();
        if (sourceIds.Count > 0)
        {
            existing = (await db.Expenses
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

        db.Expenses.AddRange(missing);
        return await db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpsertTargetAsync(ExpenseTarget target, CancellationToken cancellationToken)
    {
        var existing = await db.ExpenseTargets
            .FirstOrDefaultAsync(t => t.Month == target.Month, cancellationToken);

        if (existing is null)
        {
            db.ExpenseTargets.Add(target);
        }
        else
        {
            existing.TargetNabung = target.TargetNabung;
            existing.Anggaran = target.Anggaran;
            existing.Catatan = target.Catatan;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Turns a YYYY-MM key into an inclusive start and exclusive end DateOnly.</summary>
    private static (DateOnly From, DateOnly ToExclusive) MonthRange(string month)
    {
        if (!DateOnly.TryParseExact(month, "yyyy-MM", out var parsed))
        {
            throw new ArgumentOutOfRangeException(nameof(month), month, "Expected a YYYY-MM month key.");
        }

        return (parsed, parsed.AddMonths(1));
    }
}
