using Microsoft.Extensions.Configuration;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Builds the model catalog from configuration (<c>Models:Agent</c> / <c>Models:Direct</c>),
/// falling back to built-in defaults so the endpoint always returns a usable list.
/// </summary>
public class ModelCatalogService : IModelCatalogService
{
    private const string AgentSection = "Models:Agent";
    private const string DirectSection = "Models:Direct";

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

    public ModelCatalogService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public ModelCatalog GetCatalog() => new(
        Resolve(AgentSection, DefaultAgent),
        Resolve(DirectSection, DefaultDirect));

    private IReadOnlyList<ModelInfo> Resolve(string section, IReadOnlyList<ModelInfo> fallback)
    {
        var configured = _configuration.GetSection(section).Get<List<ModelInfo>>();
        return configured is { Count: > 0 } ? configured : fallback;
    }
}
