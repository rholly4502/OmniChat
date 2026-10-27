using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Registers chat-history persistence. The provider is chosen in one place so a move
/// to PostgreSQL later (for multi-instance deployments) does not touch application code:
/// add a branch here and a migration set, nothing else.
/// </summary>
public static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddChatPersistence(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(PersistenceOptions.SectionName).Get<PersistenceOptions>()
            ?? new PersistenceOptions();

        if (!options.Enabled)
        {
            // The repository stays explicitly absent rather than a null object: a read endpoint
            // that needs history then fails loudly at startup instead of silently returning
            // nothing. The turn recorder is the exception — it sits on the streaming path, where
            // a missing database must not cost the user an answer.
            services.AddScoped<IChatTurnRecorder, NoOpChatTurnRecorder>();
            return services;
        }

        var connectionString = options.ConnectionString;
        EnsureSqliteDirectoryExists(connectionString);

        services.AddDbContext<ChatDbContext>(builder => builder.UseSqlite(connectionString));
        services.AddScoped<IChatHistoryRepository, ChatHistoryRepository>();
        services.AddScoped<IChatTurnRecorder, ChatTurnRecorder>();
        services.AddScoped<IExpenseRepository, ExpenseRepository>();
        // Creates the schema on boot. Logged, not fatal: chat streaming works without history.
        services.AddHostedService<PersistenceInitializer>();
        return services;
    }

    /// <summary>
    /// Creates the parent directory of a file-backed SQLite database. SQLite creates the
    /// file but never the directory, and in Docker the mounted volume path is the one
    /// thing most likely to be missing on a fresh host.
    /// </summary>
    public static void EnsureSqliteDirectoryExists(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        var builder = new SqliteConnectionStringBuilder(connectionString);
        var dataSource = builder.DataSource;
        if (string.IsNullOrWhiteSpace(dataSource) || dataSource.Equals(":memory:", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var directory = Path.GetDirectoryName(Path.GetFullPath(dataSource));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }
}
