using Microsoft.EntityFrameworkCore;
using OmniChat.Infrastructure.Data;

// One-shot importer for the Pengeluaran ledger. Use:
//
//   dotnet run --project src/OmniChat.Seeder -- \
//       --db "Data Source=/data/omnichat.db" \
//       --path /root/Tools-Private/Pengeluaran
//
// Idempotent: re-running skips rows whose SourceId is already stored and upserts
// targets by month, so it is safe to run as many times as needed.
var cliArgs = Environment.GetCommandLineArgs().Skip(1).ToArray();

string? connectionString = null;
string? directory = null;

for (var i = 0; i < cliArgs.Length; i++)
{
    switch (cliArgs[i])
    {
        case "--db" when i + 1 < args.Length:
            connectionString = cliArgs[++i];
            break;
        case "--path" when i + 1 < args.Length:
            directory = cliArgs[++i];
            break;
        default:
            Console.Error.WriteLine($"Unknown or incomplete argument: {args[i]}");
            return 2;
    }
}

connectionString ??= Environment.GetEnvironmentVariable("PERSISTENCE_CONNECTION_STRING")
    ?? "Data Source=omnichat.db";

if (directory is null)
{
    Console.Error.WriteLine("Usage: --path <ledger-directory> [--db <connection-string>]");
    return 2;
}

var options = new DbContextOptionsBuilder<ChatDbContext>()
    .UseSqlite(connectionString)
    .Options;

await using var db = new ChatDbContext(options);

Console.WriteLine($"Applying migrations on {connectionString} …");
await db.Database.MigrateAsync();

var repository = new ExpenseRepository(db);
var importer = new ExpenseImporter(repository);

Console.WriteLine($"Importing ledger from {directory} …");
var result = await importer.ImportDirectoryAsync(directory, CancellationToken.None);

Console.WriteLine(
    $"Inserted {result.ExpensesInserted} expense row(s), upserted {result.TargetsUpserted} target(s).");

if (result.SkippedLines.Count > 0)
{
    Console.WriteLine($"Skipped {result.SkippedLines.Count} line(s):");
    foreach (var line in result.SkippedLines.Take(20))
    {
        Console.WriteLine($"  - {line}");
    }
}

return 0;
