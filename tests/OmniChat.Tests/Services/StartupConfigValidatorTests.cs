using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for StartupConfigValidator: verifies that warnings are logged
/// for insecure production settings and that non-production environments
/// are skipped.
/// </summary>
public class StartupConfigValidatorTests
{
    /// <summary>
    /// Minimal ILogger capture that records log level + formatted message.
    /// </summary>
    private sealed class CaptureLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NoopDisposable.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
            => Entries.Add((logLevel, formatter(state, exception)));

        private sealed class NoopDisposable : IDisposable
        {
            public static readonly NoopDisposable Instance = new();
            public void Dispose() { }
        }
    }

    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static CaptureLogger<StartupConfigValidator> CreateLogger() => new();

    [Fact]
    public void Validate_ProductionEmptyApiKey_LogsWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "test-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e =>
            e.Level == LogLevel.Warning && e.Message.Contains("Security:ApiKey is empty"));
    }

    [Fact]
    public void Validate_ProductionEmptyCors_LogsWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Security:Jwt:SigningKey"] = "test-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e =>
            e.Level == LogLevel.Warning && e.Message.Contains("Cors"));
    }

    [Fact]
    public void Validate_ProductionEmptyJwtSigningKey_LogsWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = ""
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e =>
            e.Level == LogLevel.Warning && e.Message.Contains("SigningKey"));
    }

    [Fact]
    public void Validate_ProductionAllSecure_NoWarnings()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "signing-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Empty(logger.Entries);
    }

    [Fact]
    public void Validate_NonProduction_NoWarnings()
    {
        // In Development, empty security settings are expected — no warnings.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "",
            ["Cors:AllowedOrigins:0"] = "",
            ["Security:Jwt:SigningKey"] = ""
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: false);

        Assert.Empty(logger.Entries);
    }

    [Fact]
    public void Validate_ProductionAllInsecure_LogsFourWarnings()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "",
            ["Security:Jwt:SigningKey"] = ""
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Equal(4, logger.Entries.Count);
        Assert.All(logger.Entries, e => Assert.Equal(LogLevel.Warning, e.Level));
    }

    [Fact]
    public void Validate_ProductionWhitespaceApiKey_LogsWarning()
    {
        // Whitespace-only values should be treated as empty.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "   ",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "test-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e => e.Message.Contains("Security:ApiKey"));
    }

    [Fact]
    public void Validate_ProductionBlankCorsEntries_TreatedAsEmpty()
    {
        // An origins array with only blank entries should trigger the CORS warning.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "",
            ["Cors:AllowedOrigins:1"] = "  ",
            ["Security:Jwt:SigningKey"] = "test-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e => e.Message.Contains("Cors"));
    }

    [Fact]
    public void Validate_ProductionReverseProxyEnabledWithoutTrustedProxies_LogsWarning()
    {
        // Enabled but no KnownProxies/KnownNetworks: only loopback is trusted, so the
        // real client IP is never recovered — worth a warning.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "signing-key",
            ["ReverseProxy:Enabled"] = "true"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e =>
            e.Level == LogLevel.Warning && e.Message.Contains("ReverseProxy"));
    }

    [Fact]
    public void Validate_ProductionReverseProxyEnabledWithKnownNetwork_NoWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "signing-key",
            ["ReverseProxy:Enabled"] = "true",
            ["ReverseProxy:KnownNetworks:0"] = "172.18.0.0/16"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Empty(logger.Entries);
    }

    [Fact]
    public void Validate_ProductionReverseProxyDisabled_NoWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "hermes-key",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "signing-key",
            ["ReverseProxy:Enabled"] = "false"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Empty(logger.Entries);
    }

    [Fact]
    public void Validate_ProductionEmptyHermesApiKey_LogsWarning()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Security:ApiKey"] = "strong-key",
            ["Hermes:ApiKey"] = "",
            ["Cors:AllowedOrigins:0"] = "https://example.com",
            ["Security:Jwt:SigningKey"] = "signing-key"
        });
        var logger = CreateLogger();
        var validator = new StartupConfigValidator(config, logger);

        validator.Validate(isProduction: true);

        Assert.Contains(logger.Entries, e =>
            e.Level == LogLevel.Warning && e.Message.Contains("Hermes:ApiKey is empty"));
    }
}