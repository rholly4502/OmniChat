using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Validates symmetric-key (HMAC-SHA256) JWT bearer tokens: signature, issuer, audience and
/// lifetime. Inert (disabled) until <see cref="JwtOptions.SigningKey"/> is configured, mirroring
/// the API-key middleware's pass-through behaviour so development and the test suite need no secrets.
/// </summary>
public sealed class JwtTokenValidator
{
    // MapInboundClaims=false keeps claim names verbatim (e.g. "sub" stays "sub") instead of
    // remapping them to legacy WS-Federation ClaimTypes.
    private readonly JwtSecurityTokenHandler _handler = new() { MapInboundClaims = false };
    private readonly TokenValidationParameters? _parameters;

    public JwtTokenValidator(JwtOptions options)
    {
        Options = options;

        if (IsEnabled)
        {
            _parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = options.Issuer,
                ValidateAudience = true,
                ValidAudience = options.Audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey!)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
            };
        }
    }

    public JwtOptions Options { get; }

    /// <summary>True when a signing key is configured.</summary>
    public bool IsEnabled => !string.IsNullOrWhiteSpace(Options.SigningKey);

    /// <summary>
    /// Attempts to validate <paramref name="token"/>. Returns true and sets
    /// <paramref name="principal"/> on success; false (with a null principal) on any failure.
    /// </summary>
    public bool TryValidate(string? token, out ClaimsPrincipal? principal)
    {
        principal = null;
        if (!IsEnabled || string.IsNullOrWhiteSpace(token))
            return false;

        try
        {
            principal = _handler.ValidateToken(token, _parameters!, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            // Malformed / non-JWT strings surface as ArgumentException.
            return false;
        }
    }
}
