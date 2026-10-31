namespace OmniChat.Domain.Models;

/// <summary>
/// Encodes and decodes the token-usage frames that <c>ChatService</c> streams and
/// <c>ChatController</c> forwards to the browser as <c>data: {"usage":{...}}</c>.
/// </summary>
/// <remarks>
/// Mirror of <see cref="ProgressPhase"/>: the codec is the single place that decides what a
/// usage frame looks like on the wire. The wire form is a plain string sentinel
/// (<c>[usage: P|C]</c>), matching the existing contract where every streamed item is either
/// assistant text or a bracketed sentinel. The JSON envelope is added by the controller, the
/// only layer that knows about SSE.
/// </remarks>
public static class UsageFrame
{
    /// <summary>Builds the upstream frame for a token-usage report.</summary>
    public static string Encode(int promptTokens, int completionTokens) =>
        $"[usage: {promptTokens}|{completionTokens}]";

    /// <summary>
    /// Returns the usage carried by <paramref name="token"/>, or <c>null</c> when the token is
    /// not a usage frame.
    /// </summary>
    public static (int PromptTokens, int CompletionTokens)? TryRead(string token)
    {
        if (token is null || !token.StartsWith('[') || !token.EndsWith(']'))
        {
            return null;
        }

        var inner = token[1..^1];
        const string prefix = "usage: ";
        if (!inner.StartsWith(prefix, StringComparison.Ordinal))
        {
            return null;
        }

        var parts = inner[prefix.Length..].Split('|');
        if (parts.Length != 2) return null;
        if (!int.TryParse(parts[0], out var prompt) || !int.TryParse(parts[1], out var completion)) return null;
        if (prompt < 0 || completion < 0) return null;

        return (prompt, completion);
    }
}
