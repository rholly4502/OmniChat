namespace OmniChat.Domain.Models;

/// <summary>
/// Encodes and decodes the progress frames that <c>ChatService</c> streams and
/// <c>ChatController</c> forwards to the browser as <c>data: {"status":"…"}</c>.
/// </summary>
/// <remarks>
/// The codec is the one place that decides what a progress frame looks like. Both halves of
/// the wire format — the writer in the service and the reader in the controller — call it, so
/// the two can never drift into "writes frames nobody recognises".
/// <para>
/// The wire form is deliberately a plain string rather than a JSON object, to match the
/// existing contract where every streamed item is either assistant text or a bracketed
/// sentinel such as <c>[Error: …]</c>. The JSON envelope is added by the controller, which is
/// the only layer that knows about SSE.
/// </para>
/// </remarks>
public static class ProgressPhase
{
    /// <summary>Builds the upstream frame for <paramref name="phase"/>.</summary>
    public static string Encode(string phase) => $"[status: {phase}]";

    /// <summary>
    /// Returns the phase carried by <paramref name="token"/>, or <c>null</c> when the token is
    /// ordinary assistant text.
    /// </summary>
    public static string? TryRead(string token)
    {
        if (token is null || !token.StartsWith('[') || !token.EndsWith(']'))
        {
            return null;
        }

        var inner = token[1..^1];
        const string prefix = "status: ";
        if (!inner.StartsWith(prefix, StringComparison.Ordinal))
        {
            return null;
        }

        var phase = inner[prefix.Length..];
        return phase.Length == 0 ? null : phase;
    }
}
