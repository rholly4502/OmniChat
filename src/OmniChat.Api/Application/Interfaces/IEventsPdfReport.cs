using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Generates the events list PDF report.
/// </summary>
public interface IEventsPdfReport
{
    byte[] Build(IReadOnlyList<PromoEvent> rows, DateOnly today);
}
