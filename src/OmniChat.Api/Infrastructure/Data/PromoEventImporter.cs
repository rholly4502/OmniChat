using System.Text.Json;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>Outcome of a promo-event import.</summary>
public sealed record PromoEventImportResult(int Inserted, IReadOnlyList<string> Skipped);

/// <summary>
/// One-shot importer that loads the curated promo/event list (JSON array of event
/// objects) into the persistence database. Idempotent: rows whose
/// <see cref="PromoEvent.SourceId"/> already exists are skipped.
/// </summary>
public sealed class PromoEventImporter(IPromoEventRepository repository)
{
    /// <summary>JSON file name carrying the curated event list.</summary>
    public const string FileName = "events.json";

    public async Task<PromoEventImportResult> ImportFileAsync(
        string directoryPath, CancellationToken cancellationToken)
    {
        var path = Path.Combine(directoryPath, FileName);
        if (!File.Exists(path))
        {
            return new PromoEventImportResult(0, []);
        }

        var skipped = new List<string>();
        var events = new List<PromoEvent>();

        using var stream = File.OpenRead(path);
        var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = doc.RootElement;

        IEnumerable<JsonElement> items = root.ValueKind == JsonValueKind.Array
            ? root.EnumerateArray()
            : root.GetProperty("events").EnumerateArray();

        foreach (var item in items)
        {
            if (!item.TryGetProperty("id", out var idEl) || string.IsNullOrWhiteSpace(idEl.GetString()))
            {
                skipped.Add("baris tanpa 'id'");
                continue;
            }

            var aplikasi = item.TryGetProperty("aplikasi", out var a) ? a.GetString() : null;
            var judul = item.TryGetProperty("judul", out var j) ? j.GetString() : null;
            if (string.IsNullOrWhiteSpace(aplikasi) || string.IsNullOrWhiteSpace(judul))
            {
                skipped.Add($"id {idEl.GetString()}: tanpa aplikasi/judul");
                continue;
            }

            var ditemukan = DateOnly.TryParse(item.TryGetProperty("ditemukan", out var d) ? d.GetString() : null,
                out var ditemukanParsed) ? ditemukanParsed : DateOnly.FromDateTime(DateTime.Today);

            events.Add(new PromoEvent
            {
                Aplikasi = aplikasi,
                Judul = judul,
                Benefit = item.TryGetProperty("benefit", out var b) ? b.GetString() : null,
                Syarat = item.TryGetProperty("syarat", out var sy) ? sy.GetString() : null,
                Link = item.TryGetProperty("link", out var lk) ? lk.GetString() : null,
                BerlakuSampai = item.TryGetProperty("berlaku_sampai", out var bl) ? bl.GetString() : null,
                Ditemukan = ditemukan,
                SourceId = idEl.GetString()?.Trim(),
            });
        }

        var inserted = await repository.InsertMissingAsync(events, cancellationToken);
        return new PromoEventImportResult(inserted, skipped);
    }
}
