using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Read access to the curated job-opportunity list, plus the idempotent write path
/// used by the one-shot agent importer and operator CRUD for manual curation.
/// </summary>
public interface IOpportunityRepository
{
    /// <summary>All opportunities, optionally filtered by pipeline status, newest-first.</summary>
    Task<IReadOnlyList<Opportunity>> ListAsync(string? status, CancellationToken cancellationToken);

    /// <summary>Loads a single opportunity by id, or null when it does not exist.</summary>
    Task<Opportunity?> GetByIdAsync(long id, CancellationToken cancellationToken);

    /// <summary>Inserts opportunities whose non-empty <see cref="Opportunity.SourceId"/> is not already present.</summary>
    Task<int> InsertMissingAsync(IEnumerable<Opportunity> opportunities, CancellationToken cancellationToken);

    /// <summary>Updates the fit score for rows whose SourceId is in <paramref name="scores"/>.</summary>
    Task<int> UpdateSkorBySourceAsync(IReadOnlyDictionary<string, int?> scores, CancellationToken cancellationToken);

    /// <summary>
    /// Sets the pipeline status of one opportunity. Returns false when the id is
    /// unknown (404). The status value must already be normalized by the caller.
    /// </summary>
    Task<bool> UpdateStatusAsync(long id, string status, CancellationToken cancellationToken);

    /// <summary>
    /// Sets or clears the follow-up target date of one opportunity. Returns false
    /// when the id is unknown (404).
    /// </summary>
    Task<bool> UpdateFollowUpAsync(long id, DateOnly? tanggal, CancellationToken cancellationToken);

    /// <summary>Inserts a new opportunity and returns it with its generated id.</summary>
    Task<Opportunity> AddAsync(Opportunity opportunity, CancellationToken cancellationToken);

    /// <summary>Replaces an existing opportunity's editable fields. Returns false when id is absent.</summary>
    Task<bool> UpdateAsync(Opportunity opportunity, CancellationToken cancellationToken);

    /// <summary>Deletes an opportunity by id. Returns false when id is absent.</summary>
    Task<bool> DeleteAsync(long id, CancellationToken cancellationToken);
}
