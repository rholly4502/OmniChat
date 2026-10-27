using System.Security.Claims;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Turns the validated credentials on a request into the owner tag conversations are filed under,
/// and into the access level that decides whether stored history can be read back.
/// </summary>
/// <remarks>
/// Three kinds of caller exist:
/// <list type="bullet">
/// <item>A JWT holder (identified by its <c>sub</c> claim, so every token gets its own history).</item>
/// <item>An API-key holder (the operator, filed as <see cref="AdminUserId"/>)</item>
/// <item>An anonymous guest (no credentials, filed under <see cref="GuestUserId"/>).</item>
/// </list>
/// <para>
/// Writing and reading are gated separately. Every turn is filed no matter who sent it — that is
/// what makes the audit trail complete — but only an <see cref="ChatAccess.Admin"/> caller gets
/// history back. JWT holders are admin only when their subject is listed in
/// <c>Security:AdminSubjects</c>; everyone else is a guest whose turns are stored but never listed.
/// </para>
/// </remarks>
public static class ChatIdentity
{
    /// <summary>Owner tag used for callers authenticated by the shared API key.</summary>
    public const string AdminUserId = "admin";

    /// <summary>Owner tag used for anonymous callers with no credentials.</summary>
    public const string GuestUserId = "guest";

    /// <summary>Claim carrying the subject, kept verbatim because the validator disables claim mapping.</summary>
    private const string SubjectClaim = "sub";

    /// <summary>
    /// Returns the owner tag for <paramref name="context"/>. Never returns blank: the
    /// repository rejects a blank owner outright, so a silent empty string would turn every
    /// write into a logged warning instead of a recorded turn.
    /// </summary>
    public static string ResolveUserId(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var subject = SubjectOf(context);
        if (!string.IsNullOrWhiteSpace(subject))
        {
            return subject;
        }

        return ApiKeyAuthenticated(context) ? AdminUserId : GuestUserId;
    }

    /// <summary>
    /// Access level for reading stored history. API-key holders are
    /// <see cref="ChatAccess.Admin"/>; anonymous callers are always <see cref="ChatAccess.Guest"/>.
    /// A JWT holder is admin only when its subject appears in <paramref name="adminSubjects"/>.
    /// </summary>
    /// <param name="context">The request being authorised.</param>
    /// <param name="adminSubjects">Subjects allowed to read history.</param>
    public static ChatAccess ResolveAccess(HttpContext context, IReadOnlyCollection<string>? adminSubjects)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] is not ClaimsPrincipal)
        {
            // No validated JWT: an API-key holder is the operator (admin); an anonymous caller
            // with no key is a guest.
            return ApiKeyAuthenticated(context) ? ChatAccess.Admin : ChatAccess.Guest;
        }

        var subject = SubjectOf(context);
        if (string.IsNullOrWhiteSpace(subject))
        {
            return ChatAccess.Guest;
        }

        return ContainsSubject(adminSubjects, subject) ? ChatAccess.Admin : ChatAccess.Guest;
    }

    /// <summary>True when the shared API key authenticated this request.</summary>
    private static bool ApiKeyAuthenticated(HttpContext context) =>
        context.Items.ContainsKey(ApiKeyMiddleware.ApiKeyAuthenticatedItemKey);

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
