using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Health;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Services;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.HttpOverrides;
using OmniChat.Api.Infrastructure.Networking;
using OmniChat.Api.Infrastructure.OpenApi;

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
            ContentTypes = { "application/problem+json" }
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

// Configure CORS: honour Cors:AllowedOrigins from config; fall back to AllowAll when none set
var allowedOrigins = (builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AppPolicy", policy =>
    {
        if (allowedOrigins.Length > 0)
            policy.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials();
        else
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

// Configure HttpClient for streaming LLM calls without 100-second timeout
builder.Services.AddHttpClient("LLMClient", client =>
{
    client.Timeout = Timeout.InfiniteTimeSpan;
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
        context.HttpContext.Response.ContentType = "application/problem+json";
        var problem = new ProblemDetails
        {
            Title = "Too Many Requests",
            Status = StatusCodes.Status429TooManyRequests,
            Detail = "Rate limit exceeded. Please retry after the Retry-After delay.",
            Instance = context.HttpContext.Request.Path.Value,
        };
        problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        await context.HttpContext.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(problem, global::OmniChat.Api.Infrastructure.ProblemDetailsJson.Options), cancellationToken);
    };
    options.AddTokenBucketLimiter("chatPolicy", tokenOptions =>
    {
        tokenOptions.TokenLimit = rateLimitOpts.TokenLimit;
        tokenOptions.TokensPerPeriod = rateLimitOpts.TokenLimit;
        tokenOptions.ReplenishmentPeriod = TimeSpan.FromSeconds(rateLimitOpts.ReplenishmentPeriodSeconds);
        tokenOptions.AutoReplenishment = true;
    });
    options.AddPolicy("per-ip", context =>
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

// Forwarded headers first: everything downstream (rate limiting, request logging)
// must observe the real client address and scheme when running behind a proxy.
if (reverseProxy.Enabled)
{
    app.UseForwardedHeaders();
}

// Enable response compression (must be before middleware that might write responses).
app.UseResponseCompression();


// Validate security-sensitive config at startup — logs warnings for insecure production settings.
app.Services.GetRequiredService<StartupConfigValidator>().Validate(app.Environment.IsProduction());

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
}

// Security headers: set standard response headers on every response (X-Content-Type-Options, X-Frame-Options, etc.)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.SecurityHeadersMiddleware>();

// Global exception handling — must be early in the pipeline
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.ExceptionHandlingMiddleware>();

// Correlation id: echo/propagate X-Correlation-Id and scope logs to it
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.CorrelationIdMiddleware>();

// Access log: structured per-request line (method, path, status, duration, correlation id)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.RequestLoggingMiddleware>();

// JWT bearer authentication: validates Authorization: Bearer tokens (pass-through when unconfigured)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.JwtAuthenticationMiddleware>();

// CORS must run BEFORE ApiKeyMiddleware so OPTIONS preflight requests
// get a 204 response without requiring an API key.
app.UseCors("AppPolicy");

// API-key authentication (pass-through when Security:ApiKey is not configured)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.ApiKeyMiddleware>();
app.UseRateLimiter();

// Health check: JSON body with status/version/uptime + per-check detail
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthResponseWriter.WriteAsync
});
// HTTPS redirection only outside Production: in Docker the app listens on plain
// HTTP and the reverse proxy (nginx) terminates TLS, so redirecting to HTTPS
// here would loop or break requests.
if (!app.Environment.IsProduction())
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();
app.MapControllers();

app.Run();

// Make Program class accessible to integration test project (WebApplicationFactory<Program>)
public partial class Program { }
