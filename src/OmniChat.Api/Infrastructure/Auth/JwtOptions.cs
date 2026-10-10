namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Bound from the <c>Security:Jwt</c> configuration section. JWT authentication is
/// considered <see cref="JwtTokenValidator.IsEnabled">enabled</see> only when
/// <see cref="SigningKey"/> is a non-empty symmetric HMAC key.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Security:Jwt";

    /// <summary>Symmetric HMAC-SHA256 signing key (shared secret). Empty disables JWT auth.</summary>
    public string? SigningKey { get; set; }

    /// <summary>Expected <c>iss</c> claim.</summary>
    public string Issuer { get; set; } = "OmniChat";

    /// <summary>Expected <c>aud</c> claim.</summary>
    public string Audience { get; set; } = "OmniChat";
}
