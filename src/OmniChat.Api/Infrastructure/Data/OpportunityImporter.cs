using System.Text.Json;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>Outcome of a jobs import, so a caller can log exactly what happened.</summary>
public sealed record OpportunityImportResult(int Inserted, IReadOnlyList<string> Skipped);

/// <summary>
/// One-shot importer that loads the curated job-opportunity list (a JSON file with one
/// array of opportunity objects) into the persistence database. Idempotent: rows whose
/// <see cref="Opportunity.SourceId"/> already exists are skipped, so re-running never
/// duplicates.
/// </summary>
public sealed class OpportunityImporter(IOpportunityRepository repository)
{
    /// <summary>JSON file name carrying the curated opportunity list.</summary>
    public const string FileName = "opportunities.json";

    public async Task<OpportunityImportResult> ImportFileAsync(
        string directoryPath, CancellationToken cancellationToken)
    {
        var path = Path.Combine(directoryPath, FileName);
        if (!File.Exists(path))
        {
            return new OpportunityImportResult(0, []);
        }

        var skipped = new List<string>();
        var opportunities = new List<Opportunity>();

        using var stream = File.OpenRead(path);
        var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = doc.RootElement;

        IEnumerable<JsonElement> items = root.ValueKind == JsonValueKind.Array
            ? root.EnumerateArray()
            : root.GetProperty("opportunities").EnumerateArray();

        foreach (var item in items)
        {
            if (!item.TryGetProperty("id", out var idEl) || string.IsNullOrWhiteSpace(idEl.GetString()))
            {
                skipped.Add("baris tanpa 'id'");
                continue;
            }

            var judul = item.TryGetProperty("judul", out var j) ? j.GetString() : null;
            var perusahaan = item.TryGetProperty("perusahaan", out var p) ? p.GetString() : null;
            if (string.IsNullOrWhiteSpace(judul) || string.IsNullOrWhiteSpace(perusahaan))
            {
                skipped.Add($"id {idEl.GetString()}: tanpa judul/perusahaan");
                continue;
            }

            var ditemukan = DateOnly.TryParse(item.TryGetProperty("ditemukan", out var d) ? d.GetString() : null,
                out var ditemukanParsed) ? ditemukanParsed : DateOnly.FromDateTime(DateTime.Today);

            opportunities.Add(new Opportunity
            {
                Judul = judul,
                Perusahaan = perusahaan,
                Lokasi = item.TryGetProperty("lokasi", out var l) ? l.GetString() ?? "" : "",
                Tipe = item.TryGetProperty("tipe", out var t) ? t.GetString() ?? "" : "",
                Gaji = item.TryGetProperty("gaji", out var g) ? g.GetString() : null,
                Link = item.TryGetProperty("link", out var lk) ? lk.GetString() : null,
                Catatan = item.TryGetProperty("catatan", out var ct) ? ct.GetString() : null,
                Status = item.TryGetProperty("status", out var st) ? st.GetString() ?? "new" : "new",
                Skor = item.TryGetProperty("skor", out var sk) && sk.ValueKind == System.Text.Json.JsonValueKind.Number
                    ? (int?)sk.GetInt32() : null,
                Ditemukan = ditemukan,
                SourceId = idEl.GetString()?.Trim(),
            });
        }

        var inserted = await repository.InsertMissingAsync(opportunities, cancellationToken);

        var scores = opportunities
            .Where(o => o.Skor.HasValue && !string.IsNullOrWhiteSpace(o.SourceId))
            .ToDictionary(o => o.SourceId!.Trim(), o => o.Skor);
        await repository.UpdateSkorBySourceAsync(scores, cancellationToken);

        return new OpportunityImportResult(inserted, skipped);
    }
}
