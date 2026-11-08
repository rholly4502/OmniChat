using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Read access to the curated promo/event list, plus the idempotent write path
/// used by the one-shot agent importer. Read-only in the API surface; writes
/// happen only during seeding.
/// </summary>
public interface IPromoEventRepository
{
    /// <summary>All events, optionally filtered by platform, newest-first.</summary>
    Task<IReadOnlyList<PromoEvent>> ListAsync(string? aplikasi, CancellationToken cancellationToken);

    /// <summary>Inserts events whose non-empty <see cref="PromoEvent.SourceId"/> is not already present.</summary>
    Task<int> InsertMissingAsync(IEnumerable<PromoEvent> events, CancellationToken cancellationToken);
}
