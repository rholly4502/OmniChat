using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using OmniChat.Api.Infrastructure;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Health;
using OmniChat.Api.Infrastructure.Middleware;
using OmniChat.Api.Infrastructure.Networking;
using OmniChat.Api.Infrastructure.OpenApi;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Services;

// Name of the CORS policy applied to every request (must match app.UseCors below).
const string CorsPolicyName = "AppPolicy";

var builder = WebApplication.CreateBuilder(args);

// Suppress the "Server: Kestrel" response header (security: don't reveal server technology)
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    // Limit request body size to prevent DoS via oversized payloads (default: 10 MB).
    options.Limits.MaxRequestBodySize = builder.Configuration.GetValue<long?>("Kestrel:MaxRequestBodySizeBytes") ?? 10_485_760;
});

// Graceful shutdown: give in-flight SSE streams up to 30s to finish during container stop
// (default is 5s — too short for long-lived streaming connections).
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddControllers();
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer<OpenApiDocumentTransformer>();
});

// Reverse-proxy support: process X-Forwarded-For / X-Forwarded-Proto from trusted
// proxies so rate limiting and access logs see the real client address. Disabled
// unless ReverseProxy:Enabled=true, so a direct deployment is unaffected.
var reverseProxy = builder.Configuration.GetSection(ReverseProxyOptions.SectionName).Get<ReverseProxyOptions>()
    ?? new ReverseProxyOptions();
if (reverseProxy.Enabled)
{
    builder.Services.Configure<ForwardedHeadersOptions>(options => ForwardedHeadersSetup.Apply(options, reverseProxy));
}

// RFC 7807 ProblemDetails: standardize all error responses to a consistent,
// machine-readable format with `application/problem+json` content type.
builder.Services.AddProblemDetails();
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var details = new ValidationProblemDetails(context.ModelState)
        {
            Title = "Validation Failed",
        };
        details.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        return new BadRequestObjectResult(details)
        {
            ContentTypes = { ProblemDetailsResponse.ContentType }
        };
    };
});
builder.Services.AddHealthChecks();

// Response compression for non-streaming JSON responses (health, models).
// SSE (text/event-stream) is excluded — compressing streaming responses breaks chunk delivery.
builder.Services.AddResponseCompression(options =>
{
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.ExcludedMimeTypes = [.. options.ExcludedMimeTypes, "text/event-stream"];
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

// Uptime source for the enriched health response
builder.Services.AddSingleton<ServiceStartTime>();

// JWT bearer authentication (dual-auth with the API key). Inert until Security:Jwt:SigningKey is set.
var jwtOptions = new JwtOptions();
builder.Configuration.GetSection(JwtOptions.SectionName).Bind(jwtOptions);
builder.Services.AddSingleton(new JwtTokenValidator(jwtOptions));

// Strongly-typed upstream provider settings — validated once at startup instead of
// being read ad hoc from IConfiguration on every request.
builder.Services.Configure<HermesOptions>(builder.Configuration.GetSection(HermesOptions.SectionName));
builder.Services.Configure<LlmOptions>(builder.Configuration.GetSection(LlmOptions.SectionName));

// Configure CORS: honour Cors:AllowedOrigins from config. In Production an empty list is a
// misconfiguration — the SPA is served from the same origin, so nothing legitimate needs a
// wildcard. Fail fast at startup instead of silently letting any website call the API.
var allowedOrigins = (builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray();
var isProduction = builder.Environment.IsProduction();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials();
        }
        else if (isProduction)
        {
            // Production with no configured origins: the SPA is served from the same origin, so
            // no cross-origin caller is legitimate. Register a policy that can never match, so
            // the browser blocks cross-origin reads — rather than a wildcard that would let any
            // website drive this API. StartupConfigValidator warns about the empty list.
            policy.WithOrigins("https://cors-disabled.invalid").AllowAnyMethod().AllowAnyHeader();
        }
        else
        {
            // Development convenience only — never reached in Production.
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        }
    });
});

// Configure HttpClient for streaming LLM calls without the default 100-second timeout.
// A bounded connect timeout is still desirable so an unreachable gateway fails fast
// instead of leaving the client hanging on a black-holed connection.
builder.Services.AddHttpClient("LLMClient", client =>
{
    client.Timeout = Timeout.InfiniteTimeSpan;
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    ConnectTimeout = TimeSpan.FromSeconds(10),
    PooledConnectionLifetime = TimeSpan.FromMinutes(5),
});

// Register Clean Architecture Services
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddSingleton<IModelCatalogService, ModelCatalogService>();

// Startup configuration validator — warns on insecure production settings
builder.Services.AddSingleton<StartupConfigValidator>();

// Configurable rate limiting: token bucket per client IP.
// Defaults: 10 tokens / 60s — tune via RateLimit__TokenLimit / RateLimit__ReplenishmentPeriodSeconds.
var rateLimitOpts = builder.Configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>()
    ?? new RateLimitOptions();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        // Tell the client how many seconds to wait before retrying.
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter = retryAfter.TotalSeconds.ToString("F0");
        }

        await ProblemDetailsResponse.WriteAsync(
            context.HttpContext,
            StatusCodes.Status429TooManyRequests,
            "Too Many Requests",
            "Rate limit exceeded. Please retry after the Retry-After delay.",
            cancellationToken);
    };

    options.AddPolicy("chat", context =>
    {
        var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetTokenBucketLimiter(ipAddress, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = rateLimitOpts.TokenLimit,
            TokensPerPeriod = rateLimitOpts.TokenLimit,
            ReplenishmentPeriod = TimeSpan.FromSeconds(rateLimitOpts.ReplenishmentPeriodSeconds),
            AutoReplenishment = true,
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        });
    });
});

var app = builder.Build();

// Validate security-sensitive config at startup — logs warnings for insecure production settings.
// Done after Build() so the failure surfaces in the host's startup logging pipeline.
app.Services.GetRequiredService<StartupConfigValidator>().Validate(app.Environment.IsProduction());

// Forwarded headers first: everything downstream (rate limiting, request logging)
// must observe the real client address and scheme when running behind a proxy.
if (reverseProxy.Enabled)
{
    app.UseForwardedHeaders();
}

// Enable response compression (must be before middleware that might write responses).
app.UseResponseCompression();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
}

// Security headers: set standard response headers on every response (X-Content-Type-Options, X-Frame-Options, etc.)
app.UseMiddleware<SecurityHeadersMiddleware>();

// Global exception handling — must be early in the pipeline
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Correlation id: echo/propagate X-Correlation-Id and scope logs to it
app.UseMiddleware<CorrelationIdMiddleware>();

// Access log: structured per-request line (method, path, status, duration, correlation id)
app.UseMiddleware<RequestLoggingMiddleware>();

// JWT bearer authentication: validates Authorization: Bearer tokens (pass-through when unconfigured)
app.UseMiddleware<JwtAuthenticationMiddleware>();

// Routing must be registered before CORS so the CORS middleware can
// match policies to endpoints and handle OPTIONS preflight correctly.
app.UseRouting();

// CORS must run BEFORE ApiKeyMiddleware so OPTIONS preflight requests
// get a 204 response without requiring an API key.
app.UseCors(CorsPolicyName);

// API-key authentication (pass-through when Security:ApiKey is not configured)
app.UseMiddleware<ApiKeyMiddleware>();
app.UseRateLimiter();

// Health check: JSON body with status/version/uptime + per-check detail
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthResponseWriter.WriteAsync
});

// HTTPS redirection only outside Production: in Docker the app listens on plain
// HTTP and the reverse proxy terminates TLS, so redirecting to HTTPS here would loop.
if (!isProduction)
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();
app.MapControllers();

app.Run();

// Make Program class accessible to integration test project (WebApplicationFactory<Program>)
public partial class Program { }
