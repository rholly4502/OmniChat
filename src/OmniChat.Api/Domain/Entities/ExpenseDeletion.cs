namespace OmniChat.Domain.Entities;

/// <summary>
/// A web-deleted expense's ledger SourceId, kept so the idempotent importer never
/// re-inserts it. The ledger is the write side and always contains the row, so a
/// deletion performed in the web UI would be silently undone on the next hourly seed
/// unless we remember it. Rows are addressed by their ledger SourceId (the CSV id
/// column), which is the same key the importer uses to deduplicate.
/// </summary>
public class ExpenseDeletion
{
    /// <summary>Surrogate primary key (SQLite rowid autoincrement).</summary>
    public long Id { get; set; }

    /// <summary>The removed expense's ledger SourceId (the CSV correction id).</summary>
    public string SourceId { get; set; } = string.Empty;
}
