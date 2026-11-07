using System.IO;
using System.Text.RegularExpressions;
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

    // The history read split is enforced from Security:AdminSubjects. An .env deployment can only
    // pass a scalar, and the reader accepts both forms — but only if the name reaches the container.

    [Fact]
    public void DockerCompose_ForwardsChatAccessAdminSubjects()
    {
        var expected = EnvPrefix(ChatAccessPolicy.AdminSubjectsKey);

        Assert.Contains($"{expected}=", Read("docker-compose.yml"));
    }

    [Fact]
    public void EnvExample_DocumentsChatAccessAdminSubjects()
    {
        Assert.Contains($"{EnvPrefix(ChatAccessPolicy.AdminSubjectsKey)}=", Read(".env.example"));
    }

    [Fact]
    public void DeploymentDoc_DocumentsChatAccessAdminSubjects()
    {
        Assert.Contains(EnvPrefix(ChatAccessPolicy.AdminSubjectsKey), Read("docs/deployment.md"));
    }

    [Fact]
    public void Readme_DocumentsChatAccessAdminSubjects()
    {
        Assert.Contains(EnvPrefix(ChatAccessPolicy.AdminSubjectsKey), Read("README.md"));
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
    public void ExpensesController_UsesWibTodayForDefaults()
    {
        // The ledger and the whole app run in WIB (UTC+7); the advice default date
        // and the trend end-month must follow WIB, not UTC — otherwise during the
        // first 7h of a WIB day/month the analysis targets the previous day/month.
        var controller = Read("src/OmniChat.Api/Controllers/ExpensesController.cs");
        Assert.Contains("TodayWib()", controller);
        Assert.Contains("DateTime.UtcNow.AddHours(7)", controller);
        Assert.DoesNotContain("DateTime.UtcNow)", controller);
        Assert.DoesNotContain("DateOnly.FromDateTime(DateTime.UtcNow)", controller);
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

    [Fact]
    public void Frontend_ReadsHistoryFromTheServerInsteadOfLocalStorage()
    {
        // The sidebar used to keep its own session list in localStorage, which
        // meant a returning browser could not see what the backend had stored and
        // a guest saw whatever that browser had typed before. Four halves now
        // have to stay wired: the read client, the hook that owns the list, the
        // composition root's choice of that hook, and the id frame that promotes
        // a draft into a stored conversation.
        var api = Read("frontend/src/historyApi.ts");
        var hook = Read("frontend/src/hooks/useServerHistory.ts");
        var app = Read("frontend/src/App.tsx");
        var chat = Read("frontend/src/hooks/useChat.ts");

        Assert.Contains("/api/conversations", api);
        Assert.Contains("listConversations", hook);
        Assert.Contains("useServerHistory", app);
        Assert.Contains("onConversationId", app);
        Assert.Contains("onConversationId?.", chat);
        // Prose may name localStorage (the doc comment contrasts the two designs);
        // the assertion is about calls, which is what would actually persist state.
        Assert.DoesNotContain("localStorage.getItem", hook);
        Assert.DoesNotContain("localStorage.setItem", hook);
    }

    [Fact]
    public void ConversationUsage_IsCapturedFromUpstreamAndExposedToTheFrontend()
    {
        // Tahap 2 cost/token-per-conversation: the entity and DTOs carry cumulative
        // token totals, the service parses the upstream usage frame, the controller
        // forwards it and hands it to the recorder, the repository accumulates it,
        // and the frontend types expose it for the sidebar/header.
        var entity = Read("src/OmniChat.Api/Domain/Entities/Conversation.cs");
        var dtos = Read("src/OmniChat.Api/Domain/Models/ConversationDtos.cs");
        var service = Read("src/OmniChat.Api/Infrastructure/Services/ChatService.cs");
        var controller = Read("src/OmniChat.Api/Controllers/ChatController.cs");
        var repo = Read("src/OmniChat.Api/Infrastructure/Data/ChatHistoryRepository.cs");
        var frontendTypes = Read("frontend/src/types.ts");

        Assert.Contains("PromptTokens", entity);
        Assert.Contains("CompletionTokens", entity);
        Assert.Contains("TotalTokens", dtos);
        Assert.Contains("TryExtractUsage", service);
        Assert.Contains("UsageFrame.TryRead", controller);
        Assert.Contains("AddConversationUsageAsync", repo);
        Assert.Contains("totalTokens", frontendTypes);
    }

    [Fact]
    public void PerMessageUsage_IsAttachedToTheTrailingAssistantReply()
    {
        // Tahap 3 cost/status deepening: the chat hook accumulates per-turn tokens
        // and attaches them to the assistant message that produced them, and the
        // transcript renders a token/cost footnote from that usage. The cumulative
        // header/sidebar total is untouched.
        var chat = Read("frontend/src/hooks/useChat.ts");
        var messageList = Read("frontend/src/components/MessageList.tsx");
        var frontendTypes = Read("frontend/src/types.ts");

        Assert.Contains("turnUsage", chat);
        Assert.Contains("usage: { ...turnUsage }", chat);
        Assert.Contains("estimateUsd", messageList);
        Assert.Contains("usage?: TokenUsage", frontendTypes);
    }

    [Fact]
    public void PerMessageUsage_PersistsToAndSurvivesReload()
    {
        // Tahap 3 cost/status deepening (persistence seam): the Message entity and the
        // ConversationMessage DTO carry per-message token totals and the producing model,
        // the recorder stamps them onto the assistant message, and the frontend maps them
        // back when a stored transcript is loaded — so a resumed conversation keeps its
        // per-message cost footnote (it previously lost it on reload).
        var message = Read("src/OmniChat.Api/Domain/Entities/Message.cs");
        var dtos = Read("src/OmniChat.Api/Domain/Models/ConversationDtos.cs");
        var recorder = Read("src/OmniChat.Api/Infrastructure/Data/ChatTurnRecorder.cs");
        var serverHistory = Read("frontend/src/hooks/useServerHistory.ts");
        var frontendTypes = Read("frontend/src/types.ts");

        Assert.Contains("PromptTokens", message);
        Assert.Contains("CompletionTokens", message);
        Assert.Contains("string? Model", message);
        Assert.Contains("PromptTokens", dtos);
        Assert.Contains("CompletionTokens", dtos);
        Assert.Contains("string? Model", dtos);
        Assert.Contains("NewMessage", recorder);
        Assert.Contains("PromptTokens = promptTokens", recorder);
        Assert.Contains("Model = model", recorder);
        Assert.Contains("promptTokens", serverHistory);
        Assert.Contains("completionTokens", serverHistory);
        Assert.Contains("promptTokens?: number", frontendTypes);
    }

    [Fact]
    public void ConversationUsage_SupportsADateWindow()
    {
        // Tahap 3 cost/status deepening: the aggregate usage endpoint accepts an
        // optional from/to date window (like the history list) so the global stats
        // dialog can answer "how much did I spend this month". The repository filters
        // by conversation UpdatedAt; the controller forwards the query params; the
        // frontend client passes them through.
        var repoInterface = Read("src/OmniChat.Api/Application/Interfaces/IChatHistoryRepository.cs");
        var controller = Read("src/OmniChat.Api/Controllers/ConversationsController.cs");
        var repo = Read("src/OmniChat.Api/Infrastructure/Data/ChatHistoryRepository.cs");
        var frontendApi = Read("frontend/src/historyApi.ts");

        Assert.Contains("DateTimeOffset? from = null", repoInterface);
        Assert.Contains("DateTimeOffset? to = null", repoInterface);
        Assert.Contains("[FromQuery] DateTimeOffset? from", controller);
        Assert.Contains("[FromQuery] DateTimeOffset? to", controller);
        Assert.Contains("c.UpdatedAt >= fromUtc", repo);
        Assert.Contains("c.UpdatedAt < toExclusive", repo);
        Assert.Contains("filters.from", frontendApi);
        Assert.Contains("filters.to", frontendApi);
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
    public void Readme_HasScreenshotSection_ListingRequiredImages()
    {
        // Tahap 1 item 3b: the README documents which screenshots the project needs
        // (the images themselves are supplied by the user, never generated). Guard the
        // section plus every expected filename so a list entry cannot silently vanish
        // while the section heading survives.
        var readme = Read("README.md");
        var section = ExtractSection(readme, "## Screenshots");

        Assert.Contains("docs/screenshots/desktop-chat.png", section);
        Assert.Contains("docs/screenshots/mobile-chat-375.png", section);
        Assert.Contains("docs/screenshots/mobile-drawer-375.png", section);
        Assert.Contains("docs/screenshots/mode-toggle.png", section);
        Assert.Contains("docs/screenshots/error-state.png", section);
    }

    [Fact]
    public void Readme_MilestonesList_ReflectsTheShippedMilestones()
    {
        // 3c (README refresh): the milestones list must describe the code that
        // actually exists. M21–M28 shipped after the list had gone stale — it
        // stopped at M24 and listed neither the UI-audit milestones nor the
        // frontend decomposition, so a reader could not tell how large the UI
        // work had grown. Assert the highest milestone number is reached rather
        // than pinning each entry's prose.
        var readme = Read("README.md");
        var milestones = ExtractTopLevelSection(readme, "## Milestones");

        Assert.Contains("Milestone 20", milestones);
        Assert.Contains("Milestone 24", milestones);
        Assert.Contains("Milestone 28", milestones);
        // The frontend total moved from 23 to 185 across the decomposition, to 237
        // with the history/persistence work, and to 256 once the sidebar read that
        // history from the server; a regression to an older number means the feature
        // list's test claim drifted.
        Assert.Contains("256", milestones);
    }

    [Fact]
    public void Readme_FeatureList_DescribesTheShippedTestCount()
    {
        // The feature bullet still claimed "23 tests ... covering rendering, mode
        // toggle, model catalog fetch/fallback" after the suite grew past 200, and
        // omitted every capability added since M20.
        var readme = Read("README.md");
        var features = ExtractTopLevelSection(readme, "## Fitur");

        Assert.Contains("**697 tests**", features);
        // The old claim ("23 tests") is a substring of the current count, so target
        // the historical phrasing instead of a bare number. A regression to the stale
        // "23 tests" claim would not carry the "**" emphasis and is caught here.
        Assert.DoesNotContain("**23 tests**", features);
        Assert.Contains("RateLimit__TokenLimit", features);
        Assert.Contains("Streaming__IdleTimeoutSeconds", features);
    }

    [Fact]
    public void Readme_TestTotals_AgreeWithTheFeatureList()
    {
        // The README states the frontend total twice — in the feature bullet and in the
        // closing "Current totals" line — and the two had no reason to agree. This pins
        // them together so a feature-list edit cannot leave the closing line behind.
        //
        // The backend total appears in that closing line only and is not cross-checked:
        // no static guard can know the real suite size. It was 354 while the suite ran 355,
        // so whichever commit adds a backend test must bump this line by hand.
        var readme = Read("README.md");
        var features = ExtractTopLevelSection(readme, "## Fitur");
        var totalsLine = readme
            .Split('\n')
            .FirstOrDefault(line => line.StartsWith("**Current totals:**", StringComparison.Ordinal));

        Assert.NotNull(totalsLine);

        var featureTotal = Regex.Match(features, @"\*\*(\d+) tests\*\*");
        var totalsFrontend = Regex.Match(totalsLine!, @"\*\*(\d+)\*\* frontend tests");
        var totalsBackend = Regex.Match(totalsLine!, @"(\d+) backend tests");

        Assert.True(featureTotal.Success, "the feature list no longer states a test total");
        Assert.True(totalsFrontend.Success, "the closing line no longer states a frontend total");
        Assert.True(totalsBackend.Success, "the closing line no longer states a backend total");
        Assert.Equal(featureTotal.Groups[1].Value, totalsFrontend.Groups[1].Value);
    }

    [Fact]
    public void Readme_DocumentsPersistedHistoryAndItsFrames()
    {
        // Persistence reached docker-compose and appsettings without either variable
        // appearing in the docs, so an operator could not tell where history was stored
        // or how to turn it off. The SSE contract also gained a frame that every client
        // has to recognise, and a frame the README never mentions is a breaking change
        // nobody notices until the transcript prints an id.
        var readme = Read("README.md");
        var env = ExtractTopLevelSection(readme, "## Environment Variables");

        Assert.Contains("Persistence__Enabled", env);
        Assert.Contains("Persistence__ConnectionString", env);
        Assert.Contains("conversationId", readme);

        Assert.Contains("Persistence__ConnectionString", Read(".env.example"));
    }

    [Fact]
    public void Readme_DocumentsNoObsoleteMilestoneNumbers()
    {
        // "Milestone 21"/"Milestone 23" were missing while both had shipped, and the
        // old README attributed WCAG-contrast work to "Milestone 23" — a number the
        // README itself never lists. Guard the numbers that must be present.
        var readme = Read("README.md");
        var milestones = ExtractTopLevelSection(readme, "## Milestones");

        Assert.Contains("Milestone 21", milestones);
        Assert.Contains("Milestone 23", milestones);
    }

    [Fact]
    public void Readme_DocumentsConversationHistoryEndpoints()
    {
        // The read side of persistence shipped after the write side, and the README is the
        // only place a client learns that stored history is readable at all — the OpenAPI
        // document is Development-only. It is also the only place the admin/guest split is
        // explained: a guest gets 404 rather than 403, which looks like a bug without the
        // sentence that says a guest's turns are stored but never listed back.
        var readme = Read("README.md");

        Assert.Contains("### Chat history (`/api/conversations`)", readme);
        Assert.Contains("| `GET` | `/api/conversations` |", readme);
        Assert.Contains("| `GET` | `/api/conversations/{id}` |", readme);
        Assert.Contains("| `PATCH` | `/api/conversations/{id}` |", readme);
        Assert.Contains("| `DELETE` | `/api/conversations/{id}` |", readme);
        Assert.Contains("AdminSubjects", readme);
        Assert.Contains("A guest's turns are still stored", readme);
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
    public void SeedExpensesWorkflow_HasRecurrentSchedule()
    {
        // P1-1 auto-refresh: the seed workflow must run on a schedule (not
        // manual-only) so the web DB stays in sync with the latest ledger
        // without an operator dispatching it.
        var seed = Read(".github/workflows/seed-expenses.yml");
        Assert.Contains("schedule:", seed);
        Assert.Contains("cron:", seed);
        Assert.Contains("workflow_dispatch:", seed); // manual trigger must remain
    }

    [Fact]
    public void ExpensesPdfExport_ExistsBackEndAndFrontend()
    {
        // P1-2 report export: the PDF generator, the controller route and the
        // frontend button must all exist so the feature cannot silently regress
        // to CSV-only.
        var controller = Read("src/OmniChat.Api/Controllers/ExpensesController.cs");
        Assert.Contains("[HttpGet(\"export/pdf\")]", controller);
        Assert.Contains("ExpensePdfReport.Build", controller);

        var report = Read("src/OmniChat.Api/Infrastructure/Services/ExpensePdfReport.cs");
        Assert.Contains("%PDF-1.4", report);
        Assert.Contains("%%EOF", report);

        var view = Read("frontend/src/components/ExpensesView.tsx");
        Assert.Contains("Ekspor PDF", view);
        Assert.Contains("exportExpensesPdf", view);
    }


    [Fact]
    public void ExpensesAdvice_ExistsBackEndAndFrontend()
    {
        // P1-3 Analisa & Saran: the controller route, the deterministic service
        // and the frontend panel must all exist so the feature cannot silently
        // regress to day-total-only.
        var controller = Read("src/OmniChat.Api/Controllers/ExpensesController.cs");
        Assert.Contains("[HttpGet(\"advice\")]", controller);
        Assert.Contains("IExpenseAdviceService", controller);

        var service = Read("src/OmniChat.Api/Infrastructure/Services/ExpenseAdviceService.cs");
        Assert.Contains("\"over_budget\"", service);
        Assert.Contains("Nabung", service);

        var options = Read("src/OmniChat.Api/Infrastructure/Options/ExpenseAdviceOptions.cs");
        Assert.Contains("PcVga", options);
        Assert.Contains("PcSsd", options);

        var panel = Read("frontend/src/components/AdvicePanel.tsx");
        Assert.Contains("Analisa", panel);
        Assert.Contains("getExpenseAdvice", panel);

        var api = Read("frontend/src/expensesApi.ts");
        Assert.Contains("getExpenseAdvice", api);

        // P1-6 rotating daily suggestions: the backend must expose a date-keyed
        // suggestion set and both ends must carry it, so the feature cannot
        // silently regress to budget-tips-only.
        Assert.Contains("DailySuggestions", service);
        Assert.Contains("Menus", service);
        Assert.Contains("Saran Harian", panel);
        Assert.Contains("DailyTip", panel);
        Assert.Contains("DailySuggestionsDto", api);
        Assert.Contains("daily", api);
    }
    [Fact]
    public void ExpensesWriteEndpoints_ExistBackEndAndFrontend()
    {
        // P1-4/P1-5 add + edit + delete from the web: the controller write routes,
        // the repository write methods and the frontend form + handlers must all
        // exist so the feature cannot silently regress to read-only.
        var controller = Read("src/OmniChat.Api/Controllers/ExpensesController.cs");
        Assert.Contains("[HttpPost]", controller);
        Assert.Contains("[HttpPut(\"{id:long}\")]", controller);
        Assert.Contains("[HttpDelete(\"{id:long}\")]", controller);
        Assert.Contains("StandardCategories", controller);

        var repository = Read("src/OmniChat.Api/Infrastructure/Data/ExpenseRepository.cs");
        Assert.Contains("AddAsync", repository);
        Assert.Contains("UpdateAsync", repository);
        Assert.Contains("DeleteAsync", repository);

        var api = Read("frontend/src/expensesApi.ts");
        Assert.Contains("createExpense", api);
        Assert.Contains("updateExpense", api);
        Assert.Contains("deleteExpense", api);

        var view = Read("frontend/src/components/ExpensesView.tsx");
        Assert.Contains("ExpenseForm", view);
        Assert.Contains("Tambah Pengeluaran", view);
        Assert.Contains("Hapus", view);
    }

    [Fact]
    public void Expenses_NabungSavingsExcludedFromBudgetSpend()
    {
        // Savings (kategori "Nabung") are not spending: they must be excluded from
        // the spend total the budget meter and the advice day-total/projection derive
        // from. This pins the rule so a regression cannot silently consume the budget.
        var repository = Read("src/OmniChat.Api/Infrastructure/Data/ExpenseRepository.cs");
        Assert.Contains("\"Nabung\"", repository);
        Assert.Contains("spend", repository);

        var service = Read("src/OmniChat.Api/Infrastructure/Services/ExpenseAdviceService.cs");
        Assert.Contains("r.Kategori != \"Nabung\"", service);
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
    /// <summary>
    /// Extracts a markdown section starting at <paramref name="heading"/> up to the
    /// next heading of the same or higher level (<c>##</c> or <c>###</c>).
    /// </summary>
    private static string ExtractSection(string markdown, string heading)
    {
        var start = markdown.IndexOf(heading, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Section '{heading}' not found in markdown");

        return SliceToNextHeading(markdown, start, heading.Length);
    }

    /// <summary>
    /// Extracts the top-level <c>##</c> section whose heading starts the given line,
    /// stopping at the next <c>##</c> heading.
    /// </summary>
    private static string ExtractTopLevelSection(string markdown, string headingLine)
    {
        var start = markdown.IndexOf(headingLine, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Section '{headingLine}' not found in markdown");

        return SliceToNextHeading(markdown, start, headingLine.Length);
    }

    private static string SliceToNextHeading(string markdown, int start, int headingLength)
    {
        var searchFrom = start + headingLength;
        var nextHeading = markdown.IndexOf("\n## ", searchFrom, StringComparison.Ordinal);
        if (nextHeading < 0)
            nextHeading = markdown.Length;

        return markdown[start..nextHeading];
    }

    /// <summary>
    /// The deploy workflow must assert that the production API actually enforces
    /// credentials. A 200 from /api/models means Security__ApiKey is unset on the
    /// VPS .env and the entire API (including the paid Hermes gateway) is open.
    /// This guard pins that check so it cannot be silently dropped.
    /// </summary>
    [Fact]
    public void DeployWorkflow_AssertsAuthEnforcement_OnPublicApi()
    {
        var deploy = Read(".github/workflows/deploy.yml");
        Assert.Contains("Auth enforcement check", deploy, StringComparison.Ordinal);
        Assert.Contains("/api/models", deploy, StringComparison.Ordinal);
        Assert.Contains("401", deploy, StringComparison.Ordinal);
        Assert.Contains("WARNING", deploy, StringComparison.Ordinal);
    }

    [Fact]
    public void HistoryApi_SendsTheListFilterQueryParams()
    {
        var api = Read("frontend/src/historyApi.ts");
        // Roadmap item 5: the server-side history filter contract (model + date
        // window). If a future refactor renames these query params, the sidebar's
        // filters silently stop applying — pin the names here.
        Assert.Contains("filters.model", api);
        Assert.Contains("filters.from", api);
        Assert.Contains("filters.to", api);
        Assert.Contains("search=$", api);
        Assert.Contains("encodeURIComponent(term)", api);
    }

    [Fact]
    public void ConversationsController_DeclaresMatchingListFilters()
    {
        var controller = Read("src/OmniChat.Api/Controllers/ConversationsController.cs");
        // The controller must accept exactly the query params the frontend sends.
        Assert.Contains("[FromQuery] string? search", controller);
        Assert.Contains("[FromQuery] string? model", controller);
        Assert.Contains("[FromQuery] DateTimeOffset? from", controller);
        Assert.Contains("[FromQuery] DateTimeOffset? to", controller);
    }

    [Fact]
    public void MessageList_SurfacesPerMessageCostFootnote()
    {
        var list = Read("frontend/src/components/MessageList.tsx");
        // Roadmap item 2: the per-message token/cost footnote must not be dropped.
        Assert.Contains("formatUsd(estimateUsd(", list);
        Assert.Contains("formatTokens(m.usage.promptTokens", list);
    }

}
