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
//
// Ctrl+C cancels the import cooperatively (via the CancellationToken threaded
// through every await), so an interrupted run leaves a consistent partial state.

return RunAsync(args).GetAwaiter().GetResult();

static async Task<int> RunAsync(string[] args)
{
    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        cts.Cancel();
    };
    var ct = cts.Token;

    string? connectionString = null;
    string? directory = null;
    string? jobsDirectory = null;
    string? eventsDirectory = null;

    for (var i = 0; i < args.Length; i++)
    {
        switch (args[i])
        {
            case "--db" when i + 1 < args.Length:
                connectionString = args[++i];
                break;
            case "--path" when i + 1 < args.Length:
                directory = args[++i];
                break;
            case "--jobs-path" when i + 1 < args.Length:
                jobsDirectory = args[++i];
                break;
            case "--events-path" when i + 1 < args.Length:
                eventsDirectory = args[++i];
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
    await db.Database.MigrateAsync(ct);

    var repository = new ExpenseRepository(db);
    var importer = new ExpenseImporter(repository);

    Console.WriteLine($"Importing ledger from {directory} …");
    var result = await importer.ImportDirectoryAsync(directory, ct);

    if (jobsDirectory is not null)
    {
        var oppImporter = new OpportunityImporter(new OpportunityRepository(db));
        var oppResult = await oppImporter.ImportFileAsync(jobsDirectory, ct);
        Console.WriteLine($"Inserted {oppResult.Inserted} opportunity row(s).");
        if (oppResult.Skipped.Count > 0)
        {
            Console.WriteLine($"Skipped {oppResult.Skipped.Count} opportunity line(s):");
            foreach (var line in oppResult.Skipped.Take(20))
            {
                Console.WriteLine($"  - {line}");
            }
        }
    }

    if (eventsDirectory is not null)
    {
        var evImporter = new PromoEventImporter(new PromoEventRepository(db));
        var evResult = await evImporter.ImportFileAsync(eventsDirectory, ct);
        Console.WriteLine($"Inserted {evResult.Inserted} promo event row(s).");
        if (evResult.Skipped.Count > 0)
        {
            Console.WriteLine($"Skipped {evResult.Skipped.Count} event line(s):");
            foreach (var line in evResult.Skipped.Take(20))
            {
                Console.WriteLine($"  - {line}");
            }
        }
    }

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
}
