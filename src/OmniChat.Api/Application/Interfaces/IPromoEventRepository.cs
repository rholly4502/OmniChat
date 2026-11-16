using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Read and write access to the curated promo/event list. Read-only in the API
/// surface for the auto-imported rows, plus operator CRUD for manual curation.
/// </summary>
public interface IPromoEventRepository
{
    /// <summary>All events, optionally filtered by platform, newest-first.</summary>
    Task<IReadOnlyList<PromoEvent>> ListAsync(string? aplikasi, CancellationToken cancellationToken);

    /// <summary>Aggregate digest for the Ringkasan card (totals + expiry buckets).</summary>
    Task<EventsSummary> EventsSummaryAsync(DateOnly today, CancellationToken cancellationToken);

    /// <summary>Inserts events whose non-empty <see cref="PromoEvent.SourceId"/> is not already present.</summary>
    Task<int> InsertMissingAsync(IEnumerable<PromoEvent> events, CancellationToken cancellationToken);

    /// <summary>Fetches one event by id, or null when absent.</summary>
    Task<PromoEvent?> GetByIdAsync(long id, CancellationToken cancellationToken);

    /// <summary>Inserts a new event and returns it with its generated id.</summary>
    Task<PromoEvent> AddAsync(PromoEvent @event, CancellationToken cancellationToken);

    /// <summary>Replaces an existing event's editable fields. Returns false when id is absent.</summary>
    Task<bool> UpdateAsync(PromoEvent @event, CancellationToken cancellationToken);

    /// <summary>Deletes an event by id. Returns false when id is absent.</summary>
    Task<bool> DeleteAsync(long id, CancellationToken cancellationToken);
}
