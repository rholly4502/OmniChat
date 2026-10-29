using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Read access to the Pengeluaran ledger, plus the idempotent write path used by the
/// one-shot importer. Read-only in the API surface; writes happen only during seeding.
/// </summary>
public interface IExpenseRepository
{
    /// <summary>Transactions for <paramref name="month"/> (YYYY-MM), newest first.</summary>
    Task<IReadOnlyList<Expense>> ListAsync(string month, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Transaction count for <paramref name="month"/> (for paging).</summary>
    Task<int> CountAsync(string month, CancellationToken cancellationToken);

    /// <summary>Total spend and per-category totals for <paramref name="month"/>.</summary>
    Task<(long Total, IReadOnlyDictionary<string, long> PerKategori)> GetTotalsAsync(string month, CancellationToken cancellationToken);

    /// <summary>Budget/saving target for <paramref name="month"/>, or null when unset.</summary>
    Task<ExpenseTarget?> GetTargetAsync(string month, CancellationToken cancellationToken);

    /// <summary>
    /// Inserts rows whose non-empty <see cref="Expense.SourceId"/> is not already present
    /// (idempotent seeding). Returns how many rows were inserted.
    /// </summary>
    Task<int> InsertMissingExpensesAsync(IEnumerable<Expense> expenses, CancellationToken cancellationToken);

    /// <summary>Creates or updates the target row for a month (upsert by Month).</summary>
    Task UpsertTargetAsync(ExpenseTarget target, CancellationToken cancellationToken);

    /// <summary>
    /// Deletes expense rows whose SourceId is in <paramref name="sourceIds"/>. Used for
    /// self-healing: income (pemasukan) source ids that were previously mis-imported as
    /// expenses are removed so income never counts toward spending.
    /// </summary>
    Task<int> DeleteBySourceIdsAsync(IEnumerable<string> sourceIds, CancellationToken cancellationToken);
}
