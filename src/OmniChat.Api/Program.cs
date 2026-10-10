using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Services;

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

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
}

// Global exception handling — must be early in the pipeline
app.UseMiddleware<OmniChat.Api.Infrastructure.Middleware.ExceptionHandlingMiddleware>();

app.UseCors("AllowAll");

app.MapHealthChecks("/health");
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
