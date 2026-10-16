using System.IO;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Networking;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Infrastructure.Services;

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
    public void EnvExample_DocumentsStreamingIdleTimeout()
    {
        var expected = $"{EnvPrefix(StreamingOptions.SectionName)}__IdleTimeoutSeconds";
        Assert.Contains(expected, Read(".env.example"));
    }

    [Fact]
    public void DockerCompose_ForwardsStreamingIdleTimeout()
    {
        var expected = $"{EnvPrefix(StreamingOptions.SectionName)}__IdleTimeoutSeconds";
        Assert.Contains(expected, Read("docker-compose.yml"));
    }

    [Fact]
    public void Readme_DocumentsStreamingIdleTimeout()
    {
        var expected = $"{EnvPrefix(StreamingOptions.SectionName)}__IdleTimeoutSeconds";
        Assert.Contains(expected, Read("README.md"));
    }

    [Fact]
    public void AppSettings_HasStreamingIdleTimeout()
    {
        Assert.Contains("\"IdleTimeoutSeconds\"", Read("src/OmniChat.Api/appsettings.json"));
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
        // The 429 Retry-After handling moved from App.tsx into the React-free
        // SSE client (src/api.ts) when streaming was extracted, and the
        // localized mapping then moved into its own presenter module
        // (src/errors.ts) when App.tsx was reduced to composition (step 9).
        // All three halves must stay present.
        var api = Read("frontend/src/api.ts");
        var errors = Read("frontend/src/errors.ts");
        var app = Read("frontend/src/App.tsx");
        Assert.Contains("Retry-After", api);
        Assert.Contains("retryAfter", errors);
        Assert.Contains("describeApiError", app);
    }

    // ── Milestone 15: ProblemDetails standardization ──

    [Fact]
    public void ProgramCs_RegistersProblemDetails()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("AddProblemDetails", program);
    }

    [Fact]
    public void ProgramCs_ConfiguresApiBehaviorOptions()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("InvalidModelStateResponseFactory", program);
        Assert.Contains("ValidationProblemDetails", program);
        Assert.Contains("traceId", program);
    }

    [Fact]
    public void ProblemDetailsResponse_IsTheSingleRfc7807Writer()
    {
        // All middleware error bodies funnel through this helper so the content type and
        // the traceId extension can never drift between endpoints.
        var src = Read("src/OmniChat.Api/Infrastructure/ProblemDetailsResponse.cs");
        Assert.Contains("application/problem+json", src);
        Assert.Contains("ProblemDetails", src);
        Assert.Contains("traceId", src);
    }

    [Theory]
    [InlineData("src/OmniChat.Api/Infrastructure/Middleware/ExceptionHandlingMiddleware.cs")]
    [InlineData("src/OmniChat.Api/Infrastructure/Middleware/ApiKeyMiddleware.cs")]
    [InlineData("src/OmniChat.Api/Infrastructure/Middleware/JwtAuthenticationMiddleware.cs")]
    public void Middleware_EmitsErrorsThroughTheSharedRfc7807Writer(string relativePath)
    {
        // Guards against a middleware hand-rolling its own error body (which previously
        // duplicated the content type and could silently diverge from RFC 7807).
        var src = Read(relativePath);
        Assert.Contains("ProblemDetailsResponse", src);
    }

    [Fact]
    public void RateLimiter_UsesProblemJsonContentType()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("application/problem+json", program);
    }

    [Fact]
    public void ProblemDetailsJsonHelper_Exists()
    {
        var src = Read("src/OmniChat.Api/Infrastructure/ProblemDetailsJson.cs");
        Assert.Contains("JsonSerializerDefaults.Web", src);
        Assert.Contains("ProblemDetailsJson", src);
    }

    // ── Milestone 16: reverse-proxy forwarded headers ──

    [Fact]
    public void DockerCompose_ForwardsReverseProxySettings()
    {
        var prefix = EnvPrefix(ReverseProxyOptions.SectionName);
        var compose = Read("docker-compose.yml");

        Assert.Contains($"{prefix}__Enabled=", compose);
        Assert.Contains($"{prefix}__KnownNetworks=", compose);
        Assert.Contains($"{prefix}__KnownProxies=", compose);
        Assert.Contains($"{prefix}__ForwardLimit=", compose);
    }

    [Fact]
    public void EnvExample_DocumentsReverseProxySettings()
    {
        var prefix = EnvPrefix(ReverseProxyOptions.SectionName);
        var env = Read(".env.example");

        Assert.Contains($"{prefix}__Enabled=", env);
        Assert.Contains($"{prefix}__KnownNetworks=", env);
    }

    [Fact]
    public void DeploymentDoc_DocumentsReverseProxy()
    {
        Assert.Contains(ReverseProxyOptions.SectionName, Read("docs/deployment.md"));
    }

    [Fact]
    public void AppSettings_DeclareReverseProxySection()
    {
        Assert.Contains(ReverseProxyOptions.SectionName, Read("src/OmniChat.Api/appsettings.json"));
    }

    [Fact]
    public void ProgramCs_EnablesForwardedHeadersThroughTheSetupHelper()
    {
        var program = Read("src/OmniChat.Api/Program.cs");

        Assert.Contains("UseForwardedHeaders", program);
        Assert.Contains("ForwardedHeadersSetup.Apply", program);
        Assert.Contains(ReverseProxyOptions.SectionName, program);
    }

    [Fact]
    public void ProgramCs_AppliesForwardedHeadersBeforeRateLimiter()
    {
        // Ordering is correctness, not style: if the rate limiter runs before the
        // forwarded headers are applied it partitions on the proxy's IP and every
        // client shares one bucket.
        var program = Read("src/OmniChat.Api/Program.cs");
        var forwarded = program.IndexOf("UseForwardedHeaders", StringComparison.Ordinal);
        var rateLimiter = program.IndexOf("UseRateLimiter", StringComparison.Ordinal);

        Assert.True(forwarded >= 0, "UseForwardedHeaders must be present in Program.cs");
        Assert.True(rateLimiter >= 0, "UseRateLimiter must be present in Program.cs");
        Assert.True(forwarded < rateLimiter,
            "UseForwardedHeaders must be registered before UseRateLimiter so rate limiting sees the real client IP");
    }

    [Fact]
    public void ReverseProxyOptions_UsesForwardedHeadersSectionName()
    {
        // Guards against a rename that would silently stop binding the config.
        Assert.Equal("ReverseProxy", ReverseProxyOptions.SectionName);
    }

    // ── Milestone 17: model-catalog configurability ──

    [Fact]
    public void DockerCompose_ForwardsModelCatalog()
    {
        var compose = Read("docker-compose.yml");

        Assert.Contains($"{EnvPrefix(ModelCatalogService.AgentSection)}=", compose);
        Assert.Contains($"{EnvPrefix(ModelCatalogService.DirectSection)}=", compose);
    }

    [Fact]
    public void EnvExample_DocumentsModelCatalog()
    {
        var env = Read(".env.example");

        Assert.Contains($"{EnvPrefix(ModelCatalogService.AgentSection)}=", env);
        Assert.Contains($"{EnvPrefix(ModelCatalogService.DirectSection)}=", env);
    }

    [Fact]
    public void DeploymentDoc_DocumentsModelCatalog()
    {
        var doc = Read("docs/deployment.md");

        Assert.Contains(EnvPrefix(ModelCatalogService.AgentSection), doc);
        Assert.Contains(EnvPrefix(ModelCatalogService.DirectSection), doc);
    }

    [Fact]
    public void AppSettings_DeclaresModelsSection()
    {
        // The catalog must be discoverable/overridable from a config file too.
        Assert.Contains("Models", Read("src/OmniChat.Api/appsettings.json"));
    }

    [Fact]
    public void DockerCompose_FrontendHasHealthcheck()
    {
        // The frontend service must have its own readiness probe so `docker compose ps`
        // reports whether nginx is actually serving. nginx:alpine ships BusyBox wget
        // (no curl), so the probe uses wget to hit the frontend HTTP server.
        var compose = Read("docker-compose.yml");
        var frontendBlock = compose[compose.IndexOf("  frontend:", StringComparison.Ordinal)..];

        Assert.Contains("healthcheck", frontendBlock);

        // Inspect the actual probe command, not comments around it.
        var testLine = frontendBlock
            .Split('\n')
            .First(line => line.Contains("test:", StringComparison.Ordinal));
        // nginx:alpine has BusyBox wget, not curl.
        Assert.Contains("wget", testLine);
        Assert.Contains("4173", testLine);
        Assert.DoesNotContain("curl", testLine);
    }

    // ── Milestone 18: project metadata & SSE error sanitization ──

    [Fact]
    public void LicenseFile_ExistsAndContainsMitText()
    {
        // A portfolio project must have a LICENSE file — without one the code is
        // "all rights reserved" by default. MIT is the expected license.
        Assert.True(Exists("LICENSE"), "LICENSE file is missing from the repo root");
        var license = Read("LICENSE");
        Assert.Contains("MIT License", license, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Permission is hereby granted", license, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ChatController_SseErrorEvent_DoesNotLeakExceptionMessage()
    {
        // Guard: the SSE error event in ChatController must send a generic message,
        // not ex.Message (which could leak internal URLs, API keys, or stack traces).
        var controller = Read("src/OmniChat.Api/Controllers/ChatController.cs");

        // The error event must contain a generic, fixed message
        Assert.Contains("An internal error occurred during streaming", controller);

        // Must NOT use ex.Message or ex.ToString() in client-facing output
        Assert.DoesNotContain("error = ex.Message", controller);
        Assert.DoesNotContain("error = ex.ToString()", controller);
    }

    [Fact]
    public void ChatService_ErrorMessage_DoesNotLeakStatusCode()
    {
        // Guard: ChatService must not write the upstream provider's HTTP status code
        // to the SSE channel — it goes straight to the client.
        var service = Read("src/OmniChat.Api/Infrastructure/Services/ChatService.cs");

        // Must contain the sanitized generic message
        Assert.Contains("The AI provider returned an error", service);

        // Must NOT contain the old status-code-leaking format
        Assert.DoesNotContain("Provider responded with status", service);
        Assert.DoesNotContain("{response.StatusCode}", service);
    }

    // ── Milestone 19: OpenAPI document enrichment ──

    [Fact]
    public void ProgramCs_RegistersOpenApiDocumentTransformer()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("AddDocumentTransformer", program);
        Assert.Contains("OpenApiDocumentTransformer", program);
    }

    [Fact]
    public void OpenApiDocumentTransformer_Exists()
    {
        Assert.True(Exists("src/OmniChat.Api/Infrastructure/OpenApi/OpenApiDocumentTransformer.cs"));
        var src = Read("src/OmniChat.Api/Infrastructure/OpenApi/OpenApiDocumentTransformer.cs");
        Assert.Contains("IOpenApiDocumentTransformer", src);
        Assert.Contains("OmniChat API", src);
        Assert.Contains("MIT", src);
    }

    [Fact]
    public void ChatController_StreamChatHas401ResponseType()
    {
        // The auth middleware can reject a request with 401 before the action runs.
        // The OpenAPI document should declare this response so clients know about it.
        var controller = Read("src/OmniChat.Api/Controllers/ChatController.cs");
        Assert.Contains("Status401Unauthorized", controller);
    }

    [Fact]
    public void Changelog_ExistsAndDocumentsMilestones()
    {
        Assert.True(Exists("CHANGELOG.md"), "CHANGELOG.md must exist for portfolio readability");
        var changelog = Read("CHANGELOG.md");
        Assert.Contains("MIT License", changelog, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Milestone 1", changelog);
        Assert.Contains("Milestone 18", changelog);
    }

    // ── Milestone 20: non-root container hardening ──

    [Fact]
    public void BackendDockerfile_RunsAsNonRootUser()
    {
        // The backend container must not run as root. The aspnet:10.0 base image
        // ships an `app` user (UID 101) — the Dockerfile must switch to it.
        var dockerfile = Read("Dockerfile");
        Assert.Contains("USER app", dockerfile);
    }

    [Fact]
    public void BackendDockerfile_CopiesAppAsNonRootOwner()
    {
        // Files must be owned by the `app` user so it can read them after the USER switch.
        var dockerfile = Read("Dockerfile");
        Assert.Contains("--chown=app:app", dockerfile);
    }

    [Fact]
    public void FrontendDockerfile_RunsAsNonRootUser()
    {
        // The frontend container must not run as root. nginx:alpine ships a
        // `nginx` user (UID 101) — the Dockerfile must switch to it.
        var dockerfile = Read("frontend/Dockerfile");
        Assert.Contains("USER nginx", dockerfile);
    }

    [Fact]
    public void FrontendDockerfile_CopiesAssetsAsNonRootOwner()
    {
        // nginx cache/temp dirs and static assets must be owned by the `nginx` user
        // so the non-root container can read them without CAP_CHOWN.
        var dockerfile = Read("frontend/Dockerfile");
        Assert.Contains("nginx:nginx", dockerfile);
    }

    [Fact]
    public void DockerCompose_BackendHasNoNewPrivileges()
    {
        // Prevent privilege escalation via setuid binaries inside the container.
        var compose = Read("docker-compose.yml");
        var backendBlock = compose[compose.IndexOf("  backend:", StringComparison.Ordinal)..compose.IndexOf("  frontend:", StringComparison.Ordinal)];
        Assert.Contains("no-new-privileges", backendBlock);
    }

    [Fact]
    public void DockerCompose_FrontendHasNoNewPrivileges()
    {
        var compose = Read("docker-compose.yml");
        var frontendBlock = compose[compose.IndexOf("  frontend:", StringComparison.Ordinal)..];
        Assert.Contains("no-new-privileges", frontendBlock);
    }

    [Fact]
    public void DockerCompose_BackendDropsAllCapabilities()
    {
        // Drop ALL Linux capabilities — the backend only needs to bind to port 5184
        // (>1024) and make HTTP calls. No CAP_NET_ADMIN, CAP_SYS_ADMIN, etc. needed.
        var compose = Read("docker-compose.yml");
        var backendBlock = compose[compose.IndexOf("  backend:", StringComparison.Ordinal)..compose.IndexOf("  frontend:", StringComparison.Ordinal)];
        Assert.Contains("cap_drop", backendBlock);
        Assert.Contains("ALL", backendBlock);
    }

    [Fact]
    public void DockerCompose_FrontendDropsAllCapabilities()
    {
        var compose = Read("docker-compose.yml");
        var frontendBlock = compose[compose.IndexOf("  frontend:", StringComparison.Ordinal)..];
        Assert.Contains("cap_drop", frontendBlock);
        Assert.Contains("ALL", frontendBlock);
    }

    // ── Milestone 21: README documentation consolidation ──

    [Fact]
    public void Readme_HasSingleApiReferenceSection()
    {
        // The README previously had two overlapping API sections ("## API Reference" and
        // "## API") plus a separate "## Error Responses" section that duplicated content.
        // After consolidation there should be exactly one "## API Reference" and no
        // standalone "## API" or "## Error Responses" sections.
        var readme = Read("README.md");

        Assert.Contains("## API Reference", readme);
        // No duplicate/legacy top-level API or error-response sections.
        Assert.DoesNotContain("\n## API\n", readme);
        Assert.DoesNotContain("\n## Error Responses\n", readme);
    }

    [Fact]
    public void Readme_HealthExample_MatchesActualResponseFormat()
    {
        // The README health example must match the actual HealthResponseWriter output:
        // the field is "uptimeSeconds" (integer), NOT "uptime" (string).
        // A stale example misleads anyone copying it into monitoring tooling.
        var readme = Read("README.md");
        var healthSection = ExtractSection(readme, "### GET /health");

        Assert.Contains("uptimeSeconds", healthSection);
        Assert.DoesNotContain("\"uptime\"", healthSection);
        Assert.Contains("checks", healthSection);
    }

    [Fact]
    public void Readme_MilestonesList_IncludesMilestone20()
    {
        // M20 (non-root containers + API reference docs) was committed but missing
        // from the README milestones list. Guard against it disappearing again.
        var readme = Read("README.md");
        var milestonesSection = ExtractSection(readme, "## Milestones");

        Assert.Contains("Milestone 19", milestonesSection);
        Assert.Contains("Milestone 20", milestonesSection);
    }

    [Fact]
    public void Readme_HasOpenApiSchemaSubsection()
    {
        // The OpenAPI Schema subsection was in the old "## API" section. After
        // consolidation it must still exist somewhere under API Reference.
        var readme = Read("README.md");
        Assert.Contains("### OpenAPI Schema", readme);
        Assert.Contains("IOpenApiDocumentTransformer", readme);
    }


    [Fact]
    public void CiWorkflow_RunsFrontendTests()
    {
        // M22: the CI workflow must run `npm run test` between lint and build
        // so frontend test regressions are caught in CI, not just locally.
        var ci = Read(".github/workflows/ci.yml");
        Assert.Contains("npm run test", ci);
    }

    [Fact]
    public void FrontendPackageJson_HasTestScript()
    {
        // The frontend package.json must have a "test" script so `npm run test`
        // works in CI and for local development.
        var pkgJson = Read("frontend/package.json");
        Assert.Contains("\"test\":", pkgJson);
        Assert.Contains("vitest", pkgJson);
    }

    [Fact]
    public void FrontendViteConfig_HasVitestTestSection()
    {
        // The vite.config.ts must include a vitest test section so `npm run test`
        // picks up the jsdom environment and setup files.
        var viteConfig = Read("frontend/vite.config.ts");
        Assert.Contains("environment: 'jsdom'", viteConfig);
        Assert.Contains("setupFiles", viteConfig);
    }

    [Fact]
    public void TsConfigApp_ExcludesTestFiles()
    {
        // Test files must be excluded from the production build typecheck
        // (tsc -b) so test-only imports (vitest, @testing-library) don't
        // break the build.
        var tsconfig = Read("frontend/tsconfig.app.json");
        Assert.Contains("\"exclude\"", tsconfig);
        Assert.Contains("__tests__", tsconfig);
    }

    // ── Milestone 23: configurable rate limiting ──

    [Fact]
    public void DockerCompose_ForwardsRateLimitSettings()
    {
        var prefix = EnvPrefix(RateLimitOptions.SectionName);
        var compose = Read("docker-compose.yml");

        Assert.Contains($"{prefix}__TokenLimit=", compose);
        Assert.Contains($"{prefix}__ReplenishmentPeriodSeconds=", compose);
    }

    [Fact]
    public void EnvExample_DocumentsRateLimitSettings()
    {
        var prefix = EnvPrefix(RateLimitOptions.SectionName);
        var env = Read(".env.example");

        Assert.Contains($"{prefix}__TokenLimit=", env);
        Assert.Contains($"{prefix}__ReplenishmentPeriodSeconds=", env);
    }

    [Fact]
    public void AppSettings_DeclaresRateLimitSection()
    {
        Assert.Contains(RateLimitOptions.SectionName, Read("src/OmniChat.Api/appsettings.json"));
    }

    [Fact]
    public void RateLimitPolicyName_MatchesBetweenControllerAndRegistration()
    {
        // A mismatch here silently disables throttling: [EnableRateLimiting("x")] against a
        // policy registered as "y" throws at request time, and an unregistered name would
        // leave the endpoint unprotected. Assert both sides name the same policy.
        var controller = Read("src/OmniChat.Api/Controllers/ChatController.cs");
        var program = Read("src/OmniChat.Api/Program.cs");

        var marker = "EnableRateLimiting(\"";
        var start = controller.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, "ChatController must declare [EnableRateLimiting(...)]");
        start += marker.Length;
        var policyName = controller[start..controller.IndexOf('"', start)];

        Assert.False(string.IsNullOrWhiteSpace(policyName), "Rate-limit policy name must not be empty");
        Assert.Contains($"AddPolicy(\"{policyName}\"", program);
    }

    [Fact]
    public void ProgramCs_ReadsRateLimitOptionsFromConfig()
    {
        var program = Read("src/OmniChat.Api/Program.cs");
        Assert.Contains("RateLimitOptions", program);
        Assert.Contains("rateLimitOpts.TokenLimit", program);
        Assert.Contains("rateLimitOpts.ReplenishmentPeriodSeconds", program);
    }


    // ── Milestone 24: nginx frontend proxy + non-root fix ──

    [Fact]
    public void FrontendNginxConfig_ProxiesApiToBackend()
    {
        // The frontend Docker image serves with nginx (not vite preview), so
        // nginx.conf must proxy /api/* to the backend service. Without this, API
        // calls from the Docker frontend get 404 (nginx serves index.html instead).
        var nginxConf = Read("frontend/nginx.conf");
        Assert.Contains("location /api/", nginxConf);
        Assert.Contains("proxy_pass", nginxConf);
        Assert.Contains("backend:5184", nginxConf);
    }

    [Fact]
    public void FrontendNginxConfig_HasSseProxySupport()
    {
        // SSE streaming requires proxy_buffering off and a long read timeout,
        // otherwise nginx buffers chunks and the client sees nothing until the
        // stream completes.
        var nginxConf = Read("frontend/nginx.conf");
        Assert.Contains("proxy_buffering off", nginxConf);
        Assert.Contains("proxy_read_timeout", nginxConf);
        Assert.Contains("Connection", nginxConf);
    }

    [Fact]
    public void FrontendNginxConfig_ListensOnCorrectPort()
    {
        var nginxConf = Read("frontend/nginx.conf");
        Assert.Contains("listen 4173", nginxConf);
    }

    [Fact]
    public void FrontendNginxConfig_HasSpaFallback()
    {
        var nginxConf = Read("frontend/nginx.conf");
        Assert.Contains("try_files $uri $uri/ /index.html", nginxConf);
    }

    [Fact]
    public void FrontendDockerfile_PrecreatesNginxCacheDirs()
    {
        // The Dockerfile must pre-create and chown nginx cache/temp dirs so the
        // container can run as non-root (USER nginx) without CAP_CHOWN.
        var dockerfile = Read("frontend/Dockerfile");
        Assert.Contains("/var/cache/nginx", dockerfile);
        Assert.Contains("chown", dockerfile);
    }

    [Fact]
    public void FrontendDockerfile_FixesPidPathForNonRoot()
    {
        // The default PID path (/var/run/nginx.pid) is not writable by non-root.
        // The Dockerfile must redirect it to /tmp.
        var dockerfile = Read("frontend/Dockerfile");
        Assert.Contains("/tmp/nginx.pid", dockerfile);
    }

    [Fact]
    public void DockerCompose_FrontendDoesNotPassViteProxyTarget()
    {
        // VITE_API_PROXY_TARGET was for vite preview. Since the frontend now
        // uses nginx with a hardcoded proxy_pass, this env var is unnecessary
        // in Docker and should not be forwarded (avoids confusion).
        var compose = Read("docker-compose.yml");
        var frontendBlock = compose[compose.IndexOf("  frontend:", StringComparison.Ordinal)..];
        Assert.DoesNotContain("VITE_API_PROXY_TARGET", frontendBlock);
    }

    /// <summary>
    /// Extracts a markdown section starting at <paramref name="heading"/> up to the
    /// next heading of the same or higher level (## or ###).
    /// </summary>
    private static string ExtractSection(string markdown, string heading)
    {
        var start = markdown.IndexOf(heading, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Section '{heading}' not found in markdown");

        // Find the next ## or ### heading after this one (at the start of a line).
        var searchFrom = start + heading.Length;
        var nextHeading = markdown.IndexOf("\n## ", searchFrom, StringComparison.Ordinal);
        if (nextHeading < 0)
            nextHeading = markdown.Length;

        return markdown[start..nextHeading];
    }


}
