namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Single source of truth for the request paths that bypass authentication.
/// Both <c>JwtAuthenticationMiddleware</c> and <c>ApiKeyMiddleware</c> consult this
/// helper, so the two schemes can never drift apart and leave an endpoint either
/// unintentionally protected or unintentionally public.
/// </summary>
public static class AuthExemptPaths
{
    /// <summary>Paths (matched as segments, so sub-paths are included) that need no credentials.</summary>
    private static readonly string[] Exempt =
    [
        "/health",
        "/openapi"
    ];

    /// <summary>True when <paramref name="path"/> is exempt from authentication.</summary>
    public static bool IsExempt(PathString path) =>
        Exempt.Any(prefix => path.StartsWithSegments(prefix));
}
