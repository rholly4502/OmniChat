using System.Globalization;
using System.Text.Json;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>Outcome of a ledger import, so a caller can log exactly what happened.</summary>
public sealed record ExpenseImportResult(int ExpensesInserted, int TargetsUpserted, IReadOnlyList<string> SkippedLines);

/// <summary>
/// One-shot importer that loads the Pengeluaran ledger (one CSV per month plus
/// <c>target.json</c>) into the persistence database. Idempotent: rows whose
/// <see cref="Expense.SourceId"/> already exists are skipped, and targets are upserted
/// by month, so re-running the import never duplicates data.
/// </summary>
/// <remarks>
/// The ledger is the source of truth and lives outside OmniChat; this importer only reads
/// it. Parsing is deliberately strict — an unparseable line is reported, not silently
/// dropped, so a typo in the ledger cannot corrupt the numbers shown in the UI.
/// </remarks>
public sealed class ExpenseImporter(IExpenseRepository repository)
{
    private static readonly string[] HeaderTokens = ["tanggal", "waktu", "kategori", "keterangan", "nominal", "id"];

    /// <summary>Csv file name carrying the monthly budget/saving target.</summary>
    public const string TargetFileName = "target.json";

    /// <summary>Csv file holding income (pemasukan), excluded from expense import.</summary>
    public const string IncomeFileName = "pemasukan.csv";

    public async Task<ExpenseImportResult> ImportDirectoryAsync(
        string directoryPath, CancellationToken cancellationToken)
    {
        if (!Directory.Exists(directoryPath))
        {
            throw new DirectoryNotFoundException($"Ledger directory not found: {directoryPath}");
        }

        var skipped = new List<string>();
        var expenses = new List<Expense>();

        var incomes = new List<Income>();
        foreach (var csvPath in Directory.EnumerateFiles(directoryPath, "*.csv").OrderBy(p => p))
        {
            // Pemasukan (income) is a separate ledger: seed it into Incomes (never counted
            // as an expense), and keep it out of the expense list.
            if (string.Equals(Path.GetFileName(csvPath), IncomeFileName, StringComparison.OrdinalIgnoreCase))
            {
                incomes.AddRange(ReadIncomeCsv(csvPath, skipped));
                continue;
            }

            expenses.AddRange(ReadCsv(csvPath, skipped));
        }

        // Self-healing: any expense row whose SourceId appears in the income ledger was
        // mis-imported before the split and must be removed so income never counts toward
        // spending. This keeps re-seeding safe even if a stale income row already exists.
        var incomePath = Path.Combine(directoryPath, IncomeFileName);
        if (File.Exists(incomePath))
        {
            var incomeSourceIds = ReadIncomeCsv(incomePath, skipped).Select(e => e.SourceId).Where(id => id is not null);
            await repository.DeleteBySourceIdsAsync(incomeSourceIds!, cancellationToken);
        }

        var inserted = await repository.InsertMissingExpensesAsync(expenses, cancellationToken);
        await repository.InsertMissingIncomesAsync(incomes, cancellationToken);

        var targetsUpserted = 0;
        var targetPath = Path.Combine(directoryPath, TargetFileName);
        if (File.Exists(targetPath))
        {
            targetsUpserted = await ImportTargetsAsync(targetPath, cancellationToken);
        }

        return new ExpenseImportResult(inserted, targetsUpserted, skipped);
    }

    private static IEnumerable<Income> ReadIncomeCsv(string path, List<string> skipped)
    {
        // The income ledger uses the exact same 6-column layout as expenses
        // (tanggal,waktu,kategori,keterangan,nominal,id), so reuse the battle-tested
        // parser and map the result onto Income.
        foreach (var expense in ReadCsv(path, skipped))
        {
            yield return new Income
            {
                Tanggal = expense.Tanggal,
                Keterangan = expense.Keterangan,
                Nominal = expense.Nominal,
                SourceId = expense.SourceId,
            };
        }
    }

    private static IEnumerable<Expense> ReadCsv(string path, List<string> skipped)
    {
        foreach (var rawLine in File.ReadLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var parts = line.Split(',');
            if (parts.Length < 6)
            {
                skipped.Add($"{Path.GetFileName(path)}: too few columns ({parts.Length}): {Truncate(line)}");
                continue;
            }

            // Skip the header line.
            if (parts.Length == 6 && HeaderTokens.SequenceEqual(parts, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!DateOnly.TryParseExact(parts[0].Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var tanggal))
            {
                skipped.Add($"{Path.GetFileName(path)}: bad date '{parts[0]}': {Truncate(line)}");
                continue;
            }

            // Keterangan may contain commas, so it is everything between kategori and nominal.
            // A quoted field keeps its quotes after a naive comma split, so unquote it.
            var keterangan = Unquote(parts.Length == 6 ? parts[3].Trim() : string.Join(',', parts[3..^2]).Trim());
            var nominal = ParseNominal(parts[^2]);
            if (nominal is null)
            {
                skipped.Add($"{Path.GetFileName(path)}: bad nominal '{parts[^2]}': {Truncate(line)}");
                continue;
            }

            var sourceId = Unquote(parts[^1].Trim());
            yield return new Expense
            {
                Tanggal = tanggal,
                Waktu = parts[1].Trim(),
                Kategori = parts[2].Trim(),
                Keterangan = keterangan,
                Nominal = nominal.Value,
                SourceId = sourceId.Length == 0 ? null : sourceId,
            };
        }
    }

    private async Task<int> ImportTargetsAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(path);
        var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var count = 0;

        foreach (var property in document.RootElement.EnumerateObject())
        {
            var month = property.Name.Trim();
            if (!IsMonthKey(month) || property.Value.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var target = new ExpenseTarget { Month = month };
            foreach (var field in property.Value.EnumerateObject())
            {
                switch (field.Name)
                {
                    case "target_nabung":
                        target.TargetNabung = field.Value.GetInt64();
                        break;
                    case "anggaran":
                        target.Anggaran = field.Value.GetInt64();
                        break;
                    case "catatan":
                        target.Catatan = field.Value.GetString();
                        break;
                    case "hari":
                        target.Hari = field.Value.GetInt32();
                        break;
                }
            }

            // Respect a web edit: a target the user set manually (IsUserEdited) is the
            // newer, explicit intent and must survive the recurring seed. Updating it
            // from the ledger would silently revert the user's changes the moment the
            // next hourly (or push-triggered) seed runs. Skip, but still count it so
            // the ledger floor check stays meaningful — a present, protected target is
            // not an error.
            var existing = await repository.GetTargetAsync(month, cancellationToken);
            if (existing?.IsUserEdited == true)
            {
                count++;
                continue;
            }

            await repository.UpsertTargetAsync(target, cancellationToken);
            count++;
        }

        return count;
    }

    /// <summary>Strips surrounding double quotes (CSV quoting) when present.</summary>
    private static string Unquote(string value) =>
        value.Length >= 2 && value[0] == '"' && value[^1] == '"' ? value[1..^1] : value;

    private static long? ParseNominal(string raw)
    {
        // The ledger writes plain integers, but be tolerant of thousands separators
        // (1.000 or 1,000) and spaces that a human might type.
        var cleaned = new string(raw.Where(c => char.IsAsciiDigit(c)).ToArray());
        return long.TryParse(cleaned, NumberStyles.None, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static bool IsMonthKey(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static string Truncate(string line) => line.Length <= 80 ? line : line[..80] + "…";
}
