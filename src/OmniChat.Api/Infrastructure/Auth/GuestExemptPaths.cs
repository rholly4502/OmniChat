namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Single source of truth for the request paths reachable by an anonymous guest.
/// These are the only routes where a missing/invalid API key or JWT does not block
/// the request; the controller still resolves the caller as
/// <see cref="ChatAccess.Guest"/> so it cannot read stored history and is forced off
/// the Hermes agent gateway.
/// </summary>
public static class GuestExemptPaths
{
    /// <summary>Paths (matched as segments) reachable by anonymous guests.</summary>
    private static readonly string[] GuestAllowed =
    [
        "/api/chat/stream"
    ];

    /// <summary>True when <paramref name="path"/> is reachable by an anonymous guest.</summary>
    public static bool IsGuestAllowed(PathString path) =>
        GuestAllowed.Any(prefix => path.StartsWithSegments(prefix));
}
