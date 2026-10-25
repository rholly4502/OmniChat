using Microsoft.EntityFrameworkCore;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Applies pending EF Core migrations at startup so the history tables exist before the
/// first request touches them.
/// </summary>
/// <remarks>
/// A failure is logged, not thrown: a missing or read-only volume must not take the chat
/// API down, because streaming to the model still works without history. What it must not
/// do is fail quietly — the error is logged at Error level with the reason attached.
/// </remarks>
internal sealed class PersistenceInitializer(IServiceProvider services, ILogger<PersistenceInitializer> logger)
    : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetService<ChatDbContext>();
            if (db is null)
            {
                return;
            }

            await db.Database.MigrateAsync(cancellationToken);
            logger.LogInformation(
                "Chat history storage ready ({Provider}); {Count} migration(s) applied.",
                db.Database.ProviderName,
                (await db.Database.GetAppliedMigrationsAsync(cancellationToken)).Count());
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Chat history storage could not be prepared. History endpoints will fail until the database is reachable and writable.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
