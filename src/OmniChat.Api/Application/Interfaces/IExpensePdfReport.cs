using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Generates the monthly expense report PDF.
/// </summary>
public interface IExpensePdfReport
{
    byte[] Build(string month, IReadOnlyList<Expense> rows, ExpenseBudgetSummary? budget = null);
}
