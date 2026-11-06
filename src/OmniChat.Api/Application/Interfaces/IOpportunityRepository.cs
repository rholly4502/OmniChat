using OmniChat.Domain.Entities;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Read access to the curated job-opportunity list, plus the idempotent write path
/// used by the one-shot agent importer. Read-only in the API surface; writes happen
/// only during seeding.
/// </summary>
public interface IOpportunityRepository
{
    /// <summary>All opportunities, optionally filtered by pipeline status, newest-first.</summary>
    Task<IReadOnlyList<Opportunity>> ListAsync(string? status, CancellationToken cancellationToken);

    /// <summary>Inserts opportunities whose non-empty <see cref="Opportunity.SourceId"/> is not already present.</summary>
    Task<int> InsertMissingAsync(IEnumerable<Opportunity> opportunities, CancellationToken cancellationToken);
}
