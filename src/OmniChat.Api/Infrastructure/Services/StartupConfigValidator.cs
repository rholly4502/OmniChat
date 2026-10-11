using Microsoft.Extensions.Configuration;
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
    ///   <item>Empty <c>Cors:AllowedOrigins</c> — any website can call the API.</item>
    ///   <item>Empty <c>Security:Jwt:SigningKey</c> — JWT authentication is disabled.</item>
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

        var corsOrigins = (_configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .ToArray();
        if (corsOrigins.Length == 0)
        {
            _logger.LogWarning(
                "Cors:AllowedOrigins is empty — any website can call the API. Set explicit origins via the Cors__AllowedOrigins environment variable.");
        }

        if (string.IsNullOrWhiteSpace(_configuration["Security:Jwt:SigningKey"]))
        {
            _logger.LogWarning(
                "Security:Jwt:SigningKey is empty — JWT authentication is disabled. Set a signing key via the Security__Jwt__SigningKey environment variable to enable Bearer token auth.");
        }
    }
}
