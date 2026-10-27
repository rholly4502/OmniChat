using System.Security.Claims;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Turns the validated credentials on a request into the owner tag conversations are filed under,
/// and into the access level that decides whether stored history can be read back.
/// </summary>
/// <remarks>
/// Two kinds of caller exist today: a JWT holder (identified by its <c>sub</c> claim, so every
/// token gets its own history) and an API-key holder (the operator, filed as
/// <see cref="AdminUserId"/> because a shared key carries no identity of its own).
/// <para>
/// Writing and reading are gated separately. Every turn is filed no matter who sent it — that is
/// what makes the audit trail complete — but only an <see cref="ChatAccess.Admin"/> caller gets
/// history back. The API key is itself the operator credential, so its holders are admin by
/// construction. A JWT identifies an arbitrary caller and therefore has to earn admin by having
/// its subject listed in <c>Security:AdminSubjects</c>; everyone else is a guest whose turns are
/// stored but never listed.
/// </para>
/// </remarks>
public static class ChatIdentity
{
    /// <summary>Owner tag used for callers authenticated by the shared API key.</summary>
    public const string AdminUserId = "admin";

    /// <summary>Claim carrying the subject, kept verbatim because the validator disables claim mapping.</summary>
    private const string SubjectClaim = "sub";

    /// <summary>
    /// Returns the owner tag for <paramref name="context"/>, falling back to
    /// <see cref="AdminUserId"/> when no JWT subject is present. Never returns blank: the
    /// repository rejects a blank owner outright, so a silent empty string would turn every
    /// write into a logged warning instead of a recorded turn.
    /// </summary>
    public static string ResolveUserId(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var subject = SubjectOf(context);
        return string.IsNullOrWhiteSpace(subject) ? AdminUserId : subject;
    }

    /// <summary>
    /// Access level for reading stored history. Requests authenticated by the shared API key are
    /// <see cref="ChatAccess.Admin"/>; a JWT holder is admin only when its subject appears in
    /// <paramref name="adminSubjects"/>, and a guest otherwise.
    /// </summary>
    /// <param name="context">The request being authorised.</param>
    /// <param name="adminSubjects">
    /// Subjects allowed to read history. An empty or null collection grants nobody admin, which is
    /// the safe default: turning JWT support on must not turn every token holder into an operator.
    /// </param>
    public static ChatAccess ResolveAccess(HttpContext context, IReadOnlyCollection<string>? adminSubjects)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] is ClaimsPrincipal)
        {
            var subject = SubjectOf(context);
            if (string.IsNullOrWhiteSpace(subject))
            {
                // A token with no subject cannot be matched against the admin list. Guest is the
                // safe answer, and it is consistent with ResolveUserId filing such turns under
                // AdminUserId: the row is stored, but this caller is not allowed to read it back.
                return ChatAccess.Guest;
            }

            return ContainsSubject(adminSubjects, subject) ? ChatAccess.Admin : ChatAccess.Guest;
        }

        // No validated JWT. If the request came through the shared API key (or API-key auth is
        // disabled, i.e. dev mode), the caller holds the operator's own credential → admin.
        if (context.Items[ApiKeyMiddleware.ApiKeyAuthenticatedItemKey] is true)
        {
            return ChatAccess.Admin;
        }

        // A genuinely anonymous caller on a guest-accessible route resolves as a guest: it must
        // never be mistaken for the operator, and is forced off the Hermes agent gateway.
        return ChatAccess.Guest;
    }

    /// <summary>Subject claim of a validated JWT, or <c>null</c> for API-key and unauthenticated callers.</summary>
    private static string? SubjectOf(HttpContext context) =>
        context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] is ClaimsPrincipal principal
            ? principal.FindFirst(SubjectClaim)?.Value
              ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
            : null;

    private static bool ContainsSubject(IReadOnlyCollection<string>? adminSubjects, string subject)
    {
        if (adminSubjects is null || adminSubjects.Count == 0)
        {
            return false;
        }

        foreach (var candidate in adminSubjects)
        {
            if (string.Equals(candidate, subject, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
