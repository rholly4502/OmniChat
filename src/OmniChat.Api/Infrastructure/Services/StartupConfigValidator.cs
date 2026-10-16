using Microsoft.Extensions.Configuration;
using OmniChat.Api.Infrastructure.Networking;
using Microsoft.Extensions.Logging;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Validates security-sensitive configuration at startup and logs warnings
/// for any setting that leaves the API exposed in a production deployment.
/// </summary>
public class StartupConfigValidator
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<StartupConfigValidator> _logger;

    public StartupConfigValidator(IConfiguration configuration, ILogger<StartupConfigValidator> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Checks security-sensitive settings. In Production, logs warnings for:
    /// <list type="bullet">
    ///   <item>Empty <c>Security:ApiKey</c> — the API is open (no authentication).</item>
    ///   <item>Empty <c>Cors:AllowedOrigins</c> — the CORS policy rejects every cross-origin
    ///   request (safe, but any legitimate cross-origin client is blocked too).</item>
    ///   <item>Empty <c>Security:Jwt:SigningKey</c> — JWT authentication is disabled.</item>
    ///   <item><c>ReverseProxy:Enabled</c> with no trusted proxies/networks — the real client
    ///   IP cannot be recovered, so per-IP rate limiting treats every client as one.</item>
    /// </list>
    /// Non-production environments are skipped (these settings are expected to be
    /// empty during local development).
    /// </summary>
    /// <param name="isProduction">Whether the current environment is Production.</param>
    public void Validate(bool isProduction)
    {
        if (!isProduction)
            return;

        if (string.IsNullOrWhiteSpace(_configuration["Security:ApiKey"]))
        {
            _logger.LogWarning(
                "Security:ApiKey is empty — the API is open. Set a strong API key via the Security__ApiKey environment variable.");
        }

        if (string.IsNullOrWhiteSpace(_configuration["Hermes:ApiKey"]))
        {
            _logger.LogWarning(
                "Hermes:ApiKey is empty — Hermes Bridge mode will call the gateway without authentication. Set the Hermes API key via the Hermes__ApiKey environment variable.");
        }

        var corsOrigins = (_configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .ToArray();
        if (corsOrigins.Length == 0)
        {
            _logger.LogWarning(
                "Cors:AllowedOrigins is empty — the CORS policy rejects every cross-origin request (the same-origin SPA is unaffected). Set explicit origins via the Cors__AllowedOrigins environment variable to allow a legitimate cross-origin client.");
        }

        if (string.IsNullOrWhiteSpace(_configuration["Security:Jwt:SigningKey"]))
        {
            _logger.LogWarning(
                "Security:Jwt:SigningKey is empty — JWT authentication is disabled. Set a signing key via the Security__Jwt__SigningKey environment variable to enable Bearer token auth.");
        }

        var proxy = _configuration.GetSection(ReverseProxyOptions.SectionName).Get<ReverseProxyOptions>();
        if (proxy is { Enabled: true })
        {
            var hasTrustedProxy = proxy.KnownProxies.Any(p => !string.IsNullOrWhiteSpace(p))
                || proxy.KnownNetworks.Any(n => !string.IsNullOrWhiteSpace(n));
            if (!hasTrustedProxy)
            {
                _logger.LogWarning(
                    "ReverseProxy:Enabled is true but ReverseProxy:KnownProxies and ReverseProxy:KnownNetworks are both empty — only loopback proxies are trusted, so the real client IP is not restored and per-IP rate limiting may collapse all clients into one bucket. Set ReverseProxy__KnownNetworks (e.g. the Docker bridge CIDR) or ReverseProxy__KnownProxies.");
            }
        }
    }
}
