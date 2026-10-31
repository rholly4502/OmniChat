using OmniChat.Infrastructure.Services;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Computes the Pengeluaran "Analisa &amp; Saran" report for a given date: today's spend vs
/// the daily budget, deterministic money/health tips when over budget, category trends, an
/// end-of-month projection, and the PC-goal saving estimate. Pure, deterministic, and free
/// of any external LLM call so it stays fast and testable.
/// </summary>
public interface IExpenseAdviceService
{
    /// <summary>Builds the advice report for <paramref name="date"/> (WIB).</summary>
    Task<ExpenseAdvice> BuildAsync(DateOnly date, CancellationToken cancellationToken);
}
