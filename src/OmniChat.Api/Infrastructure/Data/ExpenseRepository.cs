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

    public async Task<IReadOnlyList<Expense>> ListAllForMonthAsync(
        string month, CancellationToken cancellationToken)
    {
        var (from, toExclusive) = MonthRange(month);
        return await db.Expenses
            .AsNoTracking()
            .Where(e => e.Tanggal >= from && e.Tanggal < toExclusive)
            .OrderBy(e => e.Tanggal)
            .ThenBy(e => e.Id)
            .ToListAsync(cancellationToken);
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
        // Savings deposits (kategori "Nabung") are savings, not spending — they must
        // not count against the month's budget. The per-category breakdown keeps the
        // Nabung row so the UI can still show savings separately.
        var spend = perKategori.Where(kv => kv.Key != "Nabung").Sum(kv => kv.Value);
        return (spend, perKategori);
    }

    public async Task<long> GetCumulativeNabungAsync(string month, CancellationToken cancellationToken)
    {
        var (_, toExclusive) = MonthRange(month);
        return await db.Expenses
            .AsNoTracking()
            .Where(e => e.Kategori == "Nabung" && e.Tanggal < toExclusive)
            .SumAsync(e => (long?)e.Nominal, cancellationToken) ?? 0;
    }

    public Task<ExpenseTarget?> GetTargetAsync(string month, CancellationToken cancellationToken) =>
        db.ExpenseTargets
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Month == month, cancellationToken);

    public async Task<long> GetTotalPemasukanAsync(CancellationToken cancellationToken) =>
        await db.Incomes
            .AsNoTracking()
            .SumAsync(i => (long?)i.Nominal, cancellationToken) ?? 0;

    public async Task<long> GetTotalPengeluaranAllAsync(CancellationToken cancellationToken) =>
        await db.Expenses
            .AsNoTracking()
            .Where(e => e.Kategori != "Nabung")
            .SumAsync(e => (long?)e.Nominal, cancellationToken) ?? 0;

    public async Task<int> InsertMissingIncomesAsync(
        IEnumerable<Income> incomes, CancellationToken cancellationToken)
    {
        var list = incomes.ToList();
        if (list.Count == 0)
        {
            return 0;
        }

        var sourceIds = list
            .Where(i => !string.IsNullOrWhiteSpace(i.SourceId))
            .Select(i => i.SourceId!.Trim())
            .Distinct()
            .ToList();

        var existing = new HashSet<string>();
        if (sourceIds.Count > 0)
        {
            existing = (await db.Incomes
                    .Where(i => i.SourceId != null && sourceIds.Contains(i.SourceId))
                    .Select(i => i.SourceId!)
                    .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        var missing = list
            .Where(i => string.IsNullOrWhiteSpace(i.SourceId) ||
                        !existing.Contains(i.SourceId!.Trim()))
            .ToList();

        if (missing.Count == 0)
        {
            return 0;
        }

        db.Incomes.AddRange(missing);
        return await db.SaveChangesAsync(cancellationToken);
    }

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

            // Web-deleted ledger rows must never be re-inserted: the importer only
            // skips rows whose SourceId is already present, so a deletion performed in
            // the UI would otherwise be silently undone on the next hourly seed.
            var tombstoned = await db.ExpenseDeletions
                .Where(d => sourceIds.Contains(d.SourceId))
                .Select(d => d.SourceId)
                .ToListAsync(cancellationToken);
            existing.UnionWith(tombstoned);
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

    public async Task<int> DeleteBySourceIdsAsync(
        IEnumerable<string> sourceIds, CancellationToken cancellationToken)
    {
        var ids = sourceIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct()
            .ToList();
        if (ids.Count == 0)
        {
            return 0;
        }

        var rows = await db.Expenses
            .Where(e => e.SourceId != null && ids.Contains(e.SourceId))
            .ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            return 0;
        }

        db.Expenses.RemoveRange(rows);
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

    public async Task<IReadOnlyList<(string Month, long Total, IReadOnlyDictionary<string, long> ByCategory)>> GetMonthlyTrendAsync(
        string endMonth, int months, CancellationToken cancellationToken)
    {
        var count = Math.Clamp(months, 1, 24);
        var (_, toExclusive) = MonthRange(endMonth);
        var start = toExclusive.AddMonths(-count);

        // Savings deposits (kategori "Nabung") are savings, not spending — they must
        // not count toward the spend trend, matching GetTotalsAsync and the advice
        // engine (the summary card and the projection both exclude them).
        var rows = await db.Expenses
            .AsNoTracking()
            .Where(e => e.Tanggal >= start && e.Tanggal < toExclusive && e.Kategori != "Nabung")
            .GroupBy(e => new { e.Tanggal.Year, e.Tanggal.Month, e.Kategori })
            .Select(g => new { g.Key.Year, g.Key.Month, g.Key.Kategori, Total = g.Sum(e => e.Nominal) })
            .ToListAsync(cancellationToken);

        var result = new List<(string, long, IReadOnlyDictionary<string, long>)>(count);
        for (var i = 0; i < count; i++)
        {
            var m = start.AddMonths(i);
            var byCategory = new Dictionary<string, long>();
            foreach (var r in rows.Where(r => r.Year == m.Year && r.Month == m.Month))
                byCategory[r.Kategori] = r.Total;
            result.Add((m.ToString("yyyy-MM"), byCategory.Values.Sum(), byCategory));
        }

        return result;
    }

    public async Task<Expense?> GetByIdAsync(long id, CancellationToken cancellationToken) =>
        await db.Expenses
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

    public async Task<Expense> AddAsync(Expense expense, CancellationToken cancellationToken)
    {
        db.Expenses.Add(expense);
        await db.SaveChangesAsync(cancellationToken);
        return expense;
    }

    public async Task<bool> UpdateAsync(Expense expense, CancellationToken cancellationToken)
    {
        var row = await db.Expenses.FirstOrDefaultAsync(e => e.Id == expense.Id, cancellationToken);
        if (row is null)
        {
            return false;
        }

        row.Tanggal = expense.Tanggal;
        row.Waktu = expense.Waktu;
        row.Kategori = expense.Kategori;
        row.Keterangan = expense.Keterangan;
        row.Nominal = expense.Nominal;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        var row = await db.Expenses.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
        if (row is null)
        {
            return false;
        }

        // Remember a ledger row's SourceId so the importer does not re-insert it on the
        // next seed. Web-added rows (SourceId "web-...") are never in the ledger so they
        // never resurrect; recording them is harmless and keeps the rule uniform.
        if (!string.IsNullOrWhiteSpace(row.SourceId))
        {
            var already = await db.ExpenseDeletions
                .FirstOrDefaultAsync(d => d.SourceId == row.SourceId, cancellationToken);
            if (already is null)
            {
                db.ExpenseDeletions.Add(new ExpenseDeletion { SourceId = row.SourceId });
            }
        }

        db.Expenses.Remove(row);
        await db.SaveChangesAsync(cancellationToken);
        return true;
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
