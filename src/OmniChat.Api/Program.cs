using OmniChat.Api.Infrastructure.Health;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Services;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// Uptime source for the enriched health response
builder.Services.AddSingleton<ServiceStartTime>();

// Configure CORS: honour Cors:AllowedOrigins from config; fall back to AllowAll when none set
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
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

// Rate limiting: token bucket — 10 requests/minute per client IP
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddTokenBucketLimiter("chatPolicy", tokenOptions =>
    {
        tokenOptions.TokenLimit = 10;
        tokenOptions.TokensPerPeriod = 10;
        tokenOptions.ReplenishmentPeriod = TimeSpan.FromMinutes(1);
        tokenOptions.AutoReplenishment = true;
    });
    options.AddPolicy("per-ip", context =>
    {
        var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetTokenBucketLimiter(ipAddress, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 10,
            TokensPerPeriod = 10,
            ReplenishmentPeriod = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        });
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
}

// Global exception handling — must be early in the pipeline
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.ExceptionHandlingMiddleware>();

// Correlation id: echo/propagate X-Correlation-Id and scope logs to it
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.CorrelationIdMiddleware>();

// Access log: structured per-request line (method, path, status, duration, correlation id)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.RequestLoggingMiddleware>();

// API-key authentication (pass-through when Security:ApiKey is not configured)
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.ApiKeyMiddleware>();

app.UseCors("AppPolicy");
app.UseRateLimiter();

// Health check: JSON body with status/version/uptime + per-check detail
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthResponseWriter.WriteAsync
});
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Make Program class accessible to integration test project (WebApplicationFactory<Program>)
public partial class Program { }
