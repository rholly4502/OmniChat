namespace OmniChat.Domain.Models;

/// <summary>
/// A user's rating of a stored turn, persisted as an audit/feedback record so an
/// answer can be revisited and evaluated after the session ends. Uploaded from the
/// client as <c>"up"</c> / <c>"down"</c> / <c>null</c> (clear).
/// </summary>
public enum MessageFeedback
{
    Up,
    Down,
}
