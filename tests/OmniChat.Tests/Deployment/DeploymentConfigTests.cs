using System.IO;
using OmniChat.Api.Infrastructure.Auth;

namespace OmniChat.Tests.Deployment;

/// <summary>
/// Guards that the deployment files (docker-compose, Dockerfile, .env.example,
/// deployment doc) stay consistent with each other and with the config the code
/// actually reads. Env-var names are derived from the config section names
/// (<c>:</c> → <c>__</c>) rather than hard-coded, so this test tracks the code
/// instead of duplicating the drift.
/// </summary>
public class DeploymentConfigTests
{
    private static readonly string RepoRoot = FindRepoRoot();

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docker-compose.yml")))
        {
            dir = dir.Parent;
        }

        Assert.NotNull(dir);
        return dir!.FullName;
    }

    private static string Read(string relativePath) =>
        File.ReadAllText(Path.Combine(RepoRoot, relativePath));

    private static bool Exists(string relativePath) =>
        File.Exists(Path.Combine(RepoRoot, relativePath));

    /// <summary>Env-var form of a config section: <c>Security:Jwt</c> → <c>Security__Jwt</c>.</summary>
    private static string EnvPrefix(string section) => section.Replace(":", "__");

    [Fact]
    public void DockerCompose_ForwardsJwtSigningKey_UnderTheConfiguredSection()
    {
        var expected = $"{EnvPrefix(JwtOptions.SectionName)}__SigningKey";
        var compose = Read("docker-compose.yml");

        Assert.Contains($"{expected}=", compose);
        // No stale bare `Jwt__SigningKey` list item (binds to a section nothing reads).
        Assert.DoesNotMatch(@"(?m)^-\s*Jwt__SigningKey=", compose);
    }

    [Fact]
    public void EnvExample_DocumentsJwtSigningKey_UnderTheConfiguredSection()
    {
        var expected = $"{EnvPrefix(JwtOptions.SectionName)}__SigningKey";
        Assert.Contains($"{expected}=", Read(".env.example"));
    }

    [Fact]
    public void DeploymentDoc_DocumentsJwtSigningKey_UnderTheConfiguredSection()
    {
        var expected = $"{EnvPrefix(JwtOptions.SectionName)}__SigningKey";
        Assert.Contains(expected, Read("docs/deployment.md"));
    }

    [Fact]
    public void DockerCompose_ForwardsLlmEndpoint()
    {
        Assert.Contains("LLM__Endpoint=", Read("docker-compose.yml"));
    }

    [Fact]
    public void DockerCompose_ForwardsApiKeyAndCorsOrigins()
    {
        var compose = Read("docker-compose.yml");
        Assert.Contains("Security__ApiKey=", compose);
        Assert.Contains("Cors__AllowedOrigins=", compose);
        Assert.Contains("Hermes__Endpoint=", compose);
    }

    [Fact]
    public void DockerIgnore_ExistsAndExcludesSecretsAndBuildArtifacts()
    {
        const string dockerIgnore = ".dockerignore";
        Assert.True(Exists(dockerIgnore), $"{dockerIgnore} must exist so the build context excludes secrets/artifacts.");

        var content = Read(dockerIgnore);
        // Secrets must never enter the build context (and thus never an image layer).
        Assert.Contains(".env", content);
        // Build artifacts / dependencies must be excluded to keep images reproducible.
        Assert.Contains("node_modules", content);
        Assert.Contains("bin", content);
        Assert.Contains("obj", content);
    }

    [Fact]
    public void RuntimeImage_InstallsTheHealthcheckClient()
    {
        // mcr.microsoft.com/dotnet/aspnet does NOT bundle curl (dotnet-docker#2379),
        // yet the docker-compose backend healthcheck runs `curl -f`. The runtime
        // stage must install curl or the container is permanently "unhealthy"
        // and dependents (frontend: depends_on: service_healthy) never start.
        var compose = Read("docker-compose.yml");
        var dockerfile = Read("Dockerfile");

        var composeHealthcheckUsesCurl = compose.Contains("healthcheck") && compose.Contains("curl");
        Assert.True(composeHealthcheckUsesCurl, "Expected the compose backend healthcheck to use curl (keeps this guard meaningful).");

        Assert.Contains("curl", dockerfile);
        Assert.Contains("install", dockerfile);
    }

    [Fact]
    public void FrontendRuntimeImage_UsesTheLockfile()
    {
        // The runtime stage must install from package-lock.json (npm ci) rather than
        // a floating `npm install`, so `vite preview` uses the pinned version.
        var dockerfile = Read("frontend/Dockerfile");
        Assert.Contains("npm ci", dockerfile);
        Assert.DoesNotContain("npm install vite", dockerfile);
    }

    [Fact]
    public void ProgramCs_RegistersSecurityHeadersMiddleware()
    {
        // Security headers middleware must be wired into the pipeline.
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("SecurityHeadersMiddleware", program);
    }

    [Fact]
    public void ProgramCs_SuppressesServerHeader()
    {
        // The "Server: Kestrel" header reveals server technology — suppress it.
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("AddServerHeader", program);
    }

    [Fact]
    public void EnvExample_DocumentsJwtIssuerAndAudience()
    {
        var envExample = Read(".env.example");
        Assert.Contains("Security__Jwt__Issuer=", envExample);
        Assert.Contains("Security__Jwt__Audience=", envExample);
    }

    [Fact]
    public void DockerCompose_ForwardsJwtIssuerAndAudience()
    {
        var compose = Read("docker-compose.yml");
        Assert.Contains("Security__Jwt__Issuer=", compose);
        Assert.Contains("Security__Jwt__Audience=", compose);
    }

    [Fact]
    public void EnvExample_DocumentsKestrelMaxRequestBodySize()
    {
        var envExample = Read(".env.example");
        Assert.Contains("Kestrel__MaxRequestBodySizeBytes", envExample);
    }

    [Fact]
    public void DockerCompose_ForwardsKestrelMaxRequestBodySize()
    {
        var compose = Read("docker-compose.yml");
        Assert.Contains("Kestrel__MaxRequestBodySizeBytes", compose);
    }

    [Fact]
    public void AppSettings_HasKestrelMaxRequestBodySize()
    {
        var appsettings = Read("src/OmniChat.Api/appsettings.json");
        Assert.Contains("MaxRequestBodySizeBytes", appsettings);
    }

    [Fact]
    public void ProgramCs_RegistersStartupConfigValidator()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("StartupConfigValidator", program);
    }

    [Fact]
    public void ProgramCs_ConfiguresMaxRequestBodySize()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("MaxRequestBodySize", program);
    }

    [Fact]
    public void DockerCompose_HasBackendMemoryLimit()
    {
        var compose = Read("docker-compose.yml");
        Assert.Contains("memory: 512M", compose);
    }

    [Fact]
    public void DockerCompose_HasFrontendMemoryLimit()
    {
        var compose = Read("docker-compose.yml");
        Assert.Contains("memory: 256M", compose);
    }

    [Fact]
    public void ProgramCs_ConfiguresGracefulShutdownTimeout()
    {
        // SSE streams are long-lived; the default 5s shutdown timeout
        // would cut them off abruptly during container stop.
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("ShutdownTimeout", program);
    }

    [Fact]
    public void ChatRequest_HasModelMaxLengthValidation()
    {
        var source = Read("src/OmniChat.Api/Domain/Models/ChatRequest.cs");
        Assert.Contains("MaxLength(100", source);
    }

    [Fact]
    public void ChatRequest_HasMessagesMaxCountValidation()
    {
        var source = Read("src/OmniChat.Api/Domain/Models/ChatRequest.cs");
        Assert.Contains("MaxLength(50", source);
    }

    [Fact]
    public void ChatMessage_HasRoleValidation()
    {
        var source = Read("src/OmniChat.Api/Domain/Models/ChatRequest.cs");
        Assert.Contains("RegularExpression", source);
        Assert.Contains("user|assistant|system", source);
    }

    [Fact]
    public void ChatMessage_HasContentMaxLengthValidation()
    {
        var source = Read("src/OmniChat.Api/Domain/Models/ChatRequest.cs");
        Assert.Contains("MaxLength(8000", source);
    }

    // ── Milestone 14: API response quality polish ──

    [Fact]
    public void ProgramCs_HasRateLimitOnRejectedCallback()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("OnRejected", program);
        Assert.Contains("RetryAfter", program);
    }

    [Fact]
    public void ProgramCs_HasResponseCompression()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("AddResponseCompression", program);
        Assert.Contains("UseResponseCompression", program);
        Assert.Contains("text/event-stream", program);
    }

    [Fact]
    public void ChatController_ModelsEndpointHasResponseCache()
    {
        var controller = Read("src/OmniChat.Api/Controllers/ChatController.cs");
        Assert.Contains("ResponseCache", controller);
        Assert.Contains("Duration = 60", controller);
    }

    [Fact]
    public void Frontend_HandlesRetryAfterHeader()
    {
        var app = Read("frontend/src/App.tsx");
        Assert.Contains("Retry-After", app);
    }
}
