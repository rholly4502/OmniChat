using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Generates the jobs list PDF report.
/// </summary>
public interface IJobsPdfReport
{
    byte[] Build(IReadOnlyList<Opportunity> rows);
}
