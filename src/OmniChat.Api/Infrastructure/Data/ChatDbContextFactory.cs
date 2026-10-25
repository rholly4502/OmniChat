using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Design-time factory used by <c>dotnet ef migrations</c>. Without it the CLI has to
/// boot the whole web host (health checks, validators, middleware) just to build a model,
/// which makes migration tooling slow and dependent on runtime configuration.
/// </summary>
public sealed class ChatDbContextFactory : IDesignTimeDbContextFactory<ChatDbContext>
{
    public ChatDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite("Data Source=omnichat-design.db")
            .Options;
        return new ChatDbContext(options);
    }
}
