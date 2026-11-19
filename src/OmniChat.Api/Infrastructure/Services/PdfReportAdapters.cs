using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Adapter ke <see cref="ExpensePdfReport"/> statis agar Controller bergantung pada
/// abstraksi Application, bukan implementasi Infrastructure.
/// </summary>
public sealed class ExpensePdfReportAdapter : IExpensePdfReport
{
    public byte[] Build(string month, IReadOnlyList<Expense> rows, ExpenseBudgetSummary? budget = null)
        => ExpensePdfReport.Build(month, rows, budget);
}

/// <summary>
/// Adapter ke <see cref="JobsPdfReport"/> statis.
/// </summary>
public sealed class JobsPdfReportAdapter : IJobsPdfReport
{
    public byte[] Build(IReadOnlyList<Opportunity> rows)
        => JobsPdfReport.Build(rows);
}
