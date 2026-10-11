using Microsoft.Extensions.Configuration;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

/// <summary>
/// Unit tests for ModelCatalogService: configuration binding and default fallback.
/// </summary>
public class ModelCatalogServiceTests
{
    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public void GetCatalog_ReturnsConfiguredModels_ForBothModes()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent:0:Id"] = "hermes",
            ["Models:Agent:0:Label"] = "Hermes (Default)",
            ["Models:Agent:1:Id"] = "claude-sonnet",
            ["Models:Agent:1:Label"] = "Claude Sonnet",
            ["Models:Direct:0:Id"] = "llama-3.3",
            ["Models:Direct:0:Label"] = "Llama 3.3"
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.Collection(catalog.Agent,
            m => { Assert.Equal("hermes", m.Id); Assert.Equal("Hermes (Default)", m.Label); },
            m => { Assert.Equal("claude-sonnet", m.Id); Assert.Equal("Claude Sonnet", m.Label); });
        Assert.Single(catalog.Direct);
        Assert.Equal("llama-3.3", catalog.Direct[0].Id);
    }

    [Fact]
    public void GetCatalog_FallsBackToDefaults_WhenConfigEmpty()
    {
        var config = BuildConfig(new Dictionary<string, string?>());

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.NotEmpty(catalog.Agent);
        Assert.NotEmpty(catalog.Direct);
        Assert.Contains(catalog.Agent, m => m.Id == "hermes");
    }

    [Fact]
    public void GetCatalog_FallsBackToDefaults_ForEmptyConfiguredSection()
    {
        // A section bound but empty should still yield the default agent list.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent"] = ""
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.NotEmpty(catalog.Agent);
    }

    // ── Milestone 17: configurable model catalog ──

    [Fact]
    public void SectionNames_AreStable()
    {
        // Guards against a rename that would silently stop binding the config
        // and against the deployment-config guard's derived env-var names drifting.
        Assert.Equal("Models:Agent", ModelCatalogService.AgentSection);
        Assert.Equal("Models:Direct", ModelCatalogService.DirectSection);
    }

    [Fact]
    public void GetCatalog_BindsFromSingleJsonValue()
    {
        // Docker ergonomics: one env var per list instead of indexed keys.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent"] = "[{\"Id\":\"hermes\",\"Label\":\"Hermes (Default)\"},{\"Id\":\"gpt-4o\",\"Label\":\"GPT-4o\"}]",
            ["Models:Direct"] = "[{\"Id\":\"llama-3.3\",\"Label\":\"Llama 3.3\"}]"
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.Collection(catalog.Agent,
            m => Assert.Equal("hermes", m.Id),
            m => Assert.Equal("gpt-4o", m.Id));
        Assert.Single(catalog.Direct);
        Assert.Equal("llama-3.3", catalog.Direct[0].Id);
    }

    [Fact]
    public void GetCatalog_JsonValue_IsCaseInsensitive()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent"] = "[{\"id\":\"hermes\",\"label\":\"Hermes (Default)\"}]"
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.Single(catalog.Agent);
        Assert.Equal("hermes", catalog.Agent[0].Id);
        Assert.Equal("Hermes (Default)", catalog.Agent[0].Label);
    }

    [Fact]
    public void GetCatalog_FallsBackToDefaults_WhenJsonMalformed()
    {
        // A typo in .env must not crash startup — fall back to the built-in catalog.
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent"] = "{not valid json"
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.NotEmpty(catalog.Agent);
        Assert.Contains(catalog.Agent, m => m.Id == "hermes");
    }

    [Fact]
    public void GetCatalog_IndexedKeys_TakePrecedenceOverJsonValue()
    {
        var config = BuildConfig(new Dictionary<string, string?>
        {
            ["Models:Agent"] = "[{\"Id\":\"from-json\",\"Label\":\"JSON\"}]",
            ["Models:Agent:0:Id"] = "indexed",
            ["Models:Agent:0:Label"] = "Indexed"
        });

        var catalog = new ModelCatalogService(config).GetCatalog();

        Assert.Single(catalog.Agent);
        Assert.Equal("indexed", catalog.Agent[0].Id);
    }
}
