namespace OmniChat.Application.Interfaces;

/// <summary>
/// Resolves the authenticated user identity from an HTTP context.
/// </summary>
public interface IChatIdentity
{
    /// <summary>Owner tag for operator callers authenticated via the shared API key.</summary>
    const string AdminUserId = "admin";

    /// <summary>
    /// Isolated owner tag for unauthenticated/unidentified guest callers so their
    /// audit-trail rows never collide with the operator's <see cref="AdminUserId"/> history.
    /// </summary>
    const string GuestUserId = "guest";

    /// <summary>
    /// Resolves the owner tag for <paramref name="context"/>: the JWT subject when present,
    /// or <see cref="AdminUserId"/> when no subject is available.
    /// </summary>
    string ResolveUserId(HttpContext context);
}
