using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Services;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// Configure CORS for Web UI (Next.js / React frontend)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
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

app.UseCors("AllowAll");
app.UseRateLimiter();

app.MapHealthChecks("/health");
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Make Program class accessible to integration test project (WebApplicationFactory<Program>)
public partial class Program { }
