namespace OmniChat.Domain.Entities;

/// <summary>
/// A persisted chat conversation owned by exactly one user.
/// </summary>
/// <remarks>
/// <see cref="UserId"/> is the storage-level owner tag. Both the admin and guest
/// identities write rows here; the difference is enforced when reading (guests get
/// no history listing), never by skipping the write. Keeping every turn in the
/// database is what makes the audit trail complete.
/// </remarks>
public class Conversation
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Display title. Defaults to the first user message, truncated.</summary>
    public string Title { get; set; } = "Percakapan baru";

    /// <summary>Chat mode: "agent" (Hermes Bridge) or "direct" (upstream LLM).</summary>
    public string Mode { get; set; } = "agent";

    /// <summary>Model id used for the conversation, e.g. "hermes-default".</summary>
    public string Model { get; set; } = "default";

    /// <summary>Owner tag: an admin identity or the guest session id.</summary>
    public string UserId { get; set; } = "guest";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Message> Messages { get; set; } = [];
}
