using System.Security.Claims;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Turns the validated credentials on a request into the owner tag conversations are filed under.
/// </summary>
/// <remarks>
/// Two kinds of caller exist today: a JWT holder (identified by its <c>sub</c> claim, so every
/// token gets its own history) and an API-key holder (the operator, filed as
/// <see cref="AdminUserId"/> because a shared key carries no identity of its own). Guest
/// sessions — read-permission guests whose turns are stored for audit but never listed back —
/// will need a third branch here once guest keys exist; nothing else in the persistence path
/// has to change, because ownership is stored per row rather than inferred at read time.
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

        if (context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] is ClaimsPrincipal principal)
        {
            var subject = principal.FindFirst(SubjectClaim)?.Value
                ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (!string.IsNullOrWhiteSpace(subject))
            {
                return subject;
            }
        }

        return AdminUserId;
    }
}
