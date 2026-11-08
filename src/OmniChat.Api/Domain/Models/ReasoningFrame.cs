namespace OmniChat.Domain.Models;

/// <summary>
/// Encodes and decodes the reasoning (chain-of-thought) frames that <c>ChatService</c>
/// streams and <c>ChatController</c> forwards to the browser as
/// <c>data: {"reasoning":"…"}</c>.
/// </summary>
/// <remarks>
/// Mirror of <see cref="ProgressPhase"/> / <see cref="UsageFrame"/>: the codec is the single
/// place that decides what a reasoning frame looks like on the wire, so the writer in the
/// service and the reader in the controller can never drift apart.
/// <para>
/// The wire form is a bracketed sentinel (<c>[reasoning: …]</c>) that carries the reasoning
/// text verbatim. Unlike the status/usage frames the payload is arbitrary model text, so the
/// decoder must strip exactly one leading <c>[reasoning: </c> and one trailing <c>]</c> —
/// the last <c>]</c> of the string — rather than splitting on closing brackets. This recovers
/// any text, including reasoning that itself contains square brackets.
/// </para>
/// </remarks>
public static class ReasoningFrame
{
    private const string Prefix = "reasoning: ";

    /// <summary>Builds the upstream frame for one reasoning delta.</summary>
    public static string Encode(string reasoning) => $"[{Prefix}{reasoning}]";

    /// <summary>
    /// Returns the reasoning text carried by <paramref name="token"/>, or <c>null</c> when the
    /// token is not a reasoning frame.
    /// </summary>
    public static string? TryRead(string? token)
    {
        if (token is null || !token.StartsWith('[') || !token.EndsWith(']'))
        {
            return null;
        }

        var inner = token[1..^1];
        if (!inner.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return null;
        }

        // Everything after the prefix up to the final `]` is the reasoning text.
        var reasoning = inner[Prefix.Length..];
        return reasoning.Length == 0 ? null : reasoning;
    }
}
