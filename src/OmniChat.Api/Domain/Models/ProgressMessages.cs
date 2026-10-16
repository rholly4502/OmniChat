namespace OmniChat.Domain.Models;

/// <summary>
/// User-facing progress phases streamed as <c>{"status":"…"}</c> frames while the upstream
/// is still thinking.
/// </summary>
/// <remarks>
/// Indonesian, matching the rest of the frontend copy: the frame is rendered verbatim in the
/// chat transcript, so it must read as a sentence to the user. Keeping it server-side means a
/// single source of truth — the client never has to invent a status it was not sent.
/// </remarks>
public static class ProgressMessages
{
    /// <summary>Sent while the agent loop is running and no token has arrived yet.</summary>
    public const string Working = "Menyusun jawaban";
}
