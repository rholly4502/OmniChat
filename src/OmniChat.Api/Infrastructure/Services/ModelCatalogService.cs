using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Builds the model catalog from configuration (<c>Models:Agent</c> / <c>Models:Direct</c>),
/// falling back to built-in defaults so the endpoint always returns a usable list.
/// </summary>
/// <remarks>
/// Each section may be supplied either as indexed child keys
/// (<c>Models__Agent__0__Id</c>, <c>Models__Agent__0__Label</c>, …) or as a single JSON
/// array value (<c>Models__Agent=[{"Id":"hermes","Label":"Hermes (Default)"}]</c>) — the
/// latter keeps Docker/.env configuration to one variable per list. Indexed keys win when
/// both are present; malformed JSON logs a warning and falls back to the defaults rather
/// than failing startup.
/// </remarks>
public class ModelCatalogService : IModelCatalogService
{
    public const string AgentSection = "Models:Agent";
    public const string DirectSection = "Models:Direct";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly IReadOnlyList<ModelInfo> DefaultAgent =
    [
        new("hermes", "Hermes (Default)"),
        new("claude-sonnet", "Claude Sonnet"),
        new("gpt-4o", "GPT-4o")
    ];

    private static readonly IReadOnlyList<ModelInfo> DefaultDirect =
    [
        new("nvidia/nemotron-3.5-lightning:free", "Nemotron 3.5 (Free)"),
        new("meta-llama/llama-3.3-70b-instruct:free", "Llama 3.3 70B (Free)"),
        new("google/gemini-2.0-flash-exp:free", "Gemini 2.0 Flash (Free)")
    ];

    private readonly IConfiguration _configuration;
    private readonly ILogger<ModelCatalogService> _logger;

    public ModelCatalogService(IConfiguration configuration, ILogger<ModelCatalogService>? logger = null)
    {
        _configuration = configuration;
        _logger = logger ?? NullLogger<ModelCatalogService>.Instance;
    }

    public ModelCatalog GetCatalog() => new(
        Resolve(AgentSection, DefaultAgent),
        Resolve(DirectSection, DefaultDirect));

    private IReadOnlyList<ModelInfo> Resolve(string section, IReadOnlyList<ModelInfo> fallback)
    {
        // 1. Indexed child keys: Models:Agent:0:Id, Models:Agent:0:Label, …
        var configured = _configuration.GetSection(section).Get<List<ModelInfo>>();
        if (configured is { Count: > 0 })
            return configured;

        // 2. Single JSON array value: Models__Agent='[{"Id":"…","Label":"…"}]'
        var raw = _configuration[section];
        if (!string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<ModelInfo>>(raw, JsonOptions);
                if (parsed is { Count: > 0 })
                    return parsed;
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex,
                    "Ignoring malformed JSON in '{Section}' — using built-in model defaults. Value: {Value}",
                    section, raw);
            }
        }

        // 3. Built-in defaults.
        return fallback;
    }
}
