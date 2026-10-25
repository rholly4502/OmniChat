namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Chat-history persistence settings, bound from the <c>Persistence</c> configuration section.
/// </summary>
public sealed class PersistenceOptions
{
    public const string SectionName = "Persistence";

    /// <summary>When false the API runs stateless and no database file is touched.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// SQLite connection string. The default keeps the file inside the container's
    /// mounted <c>/data</c> volume so history survives a redeploy.
    /// </summary>
    public string ConnectionString { get; set; } = "Data Source=omnichat.db";
}
