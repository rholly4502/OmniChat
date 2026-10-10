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
}
