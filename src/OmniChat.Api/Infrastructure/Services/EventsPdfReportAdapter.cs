using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Adapter ke <see cref="EventsPdfReport"/> statis agar Controller bergantung pada abstraksi
/// Application, bukan implementasi Infrastructure.
/// </summary>
public sealed class EventsPdfReportAdapter : IEventsPdfReport
{
    public byte[] Build(IReadOnlyList<PromoEvent> rows, DateOnly today)
        => EventsPdfReport.Build(rows, today);
}
