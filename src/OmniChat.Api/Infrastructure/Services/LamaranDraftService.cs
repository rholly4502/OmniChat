using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Generates a first-draft cover letter for a job opportunity by calling the Hermes
/// gateway with Rholly's profile and the opportunity details. Non-streaming: the whole
/// draft is produced in one request so the UI can present an editable block.
/// </summary>
public sealed class LamaranDraftService : ILamaranDraftService
{
    private readonly IOpportunityRepository _repository;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly HermesOptions _hermes;
    private readonly ILogger<LamaranDraftService> _logger;

    public LamaranDraftService(
        IOpportunityRepository repository,
        IHttpClientFactory httpClientFactory,
        IOptions<HermesOptions> hermes,
        ILogger<LamaranDraftService> logger)
    {
        _repository = repository;
        _httpClientFactory = httpClientFactory;
        _hermes = hermes.Value;
        _logger = logger;
    }

    public async Task<LamaranDraft?> GenerateAsync(long opportunityId, CancellationToken cancellationToken)
    {
        var opp = await _repository.GetByIdAsync(opportunityId, cancellationToken);
        if (opp is null)
        {
            return null;
        }

        var prompt = BuildPrompt(opp);
        var draft = await CallGatewayAsync(prompt, cancellationToken);
        return new LamaranDraft(draft, "hermes");
    }

    private static string BuildPrompt(Opportunity opp)
    {
        // Profil Rholly (ringkas, sesuai skill lamaran) — disematkan karena ini aplikasi
        // pribadi satu-user milik Rholly sendiri. Jangan di-hardcode ke data sensitif lain.
        var profil = """
            Nama: Rholly
            Peran: .NET Developer (Astra via vendor), ±2 tahun pengalaman komersial.
            Stack inti: C# / .NET 8 & 10, ASP.NET Core Web API, EF Core, SQL Server &
            migrasi DB produksi (batch, rollback aman), testing (xUnit), Git, Clean
            Architecture, RabbitMQ, Redis, PostgreSQL.
            Bukti unggulan: OmniChat — aplikasi web full-stack (.NET 10 + React/Tailwind)
            dibangun end-to-end, pipeline CI/CD, seed otomatis, deployment live. Pengalaman
            migrasi data produksi SQL Server ber-batch dengan rollback aman.
            Bahasa: Indonesia (native), Inggris (kerja/tulis cukup).
            Kendala: ±2 tahun → jangan klaim senioritas 5+ tahun.
            """;

        var lowongan = $"""
            Judul: {opp.Judul}
            Perusahaan: {opp.Perusahaan}
            Lokasi: {opp.Lokasi}
            Tipe: {opp.Tipe}
            Gaji: {opp.Gaji ?? "tidak tercantum"}
            Catatan: {opp.Catatan ?? "-"}
            Link: {opp.Link ?? "-"}
            """;

        return $"""
            Kamu membantu Rholly menulis SURAT LAMARAN (cover letter) draft untuk satu
            lowongan. Tulis dalam BAHASA INGGRIS bila lowongan/lokasi berbahasa Inggris
            (remote, Malaysia, Singapura), atau Bahasa Indonesia untuk lowongan lokal.

            Persyaratan draft:
            - ≤ 250 kata.
            - Spesifik: sebut stack & kebutuhan spesifik lowongan.
            - Jangan overclaim (jangan klaim senioritas yang belum dimiliki).
            - Hindari kalimat template kosong; tonjolkan bukti nyata.
            - Format: mulai dengan baris "Subject: Application for <Role> at <Company>",
              lalu "Dear Hiring Manager,", isi, dan tutup dengan "Best regards, Rholly".
            - Hanya keluarkan isi surat (tanpa penjelasan lain).

            PROFIL KANDIDAT:
            {profil}

            DETAIL LOWONGAN:
            {lowongan}
            """;
    }

    private async Task<string> CallGatewayAsync(string prompt, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("LLMClient");

        var payload = new Dictionary<string, object?>
        {
            ["model"] = "hermes",
            ["stream"] = false,
            ["messages"] = new object[]
            {
                new { role = "system", content = "Kamu adalah asisten penulisan lamaran kerja yang teliti dan jujur." },
                new { role = "user", content = prompt }
            }
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, _hermes.Endpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrEmpty(_hermes.ApiKey))
        {
            httpRequest.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _hermes.ApiKey);
        }

        using var response = await client.SendAsync(httpRequest, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Lamaran draft gateway error: {StatusCode}", response.StatusCode);
            throw new InvalidOperationException("Gateway AI sedang tidak tersedia.");
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                choices.ValueKind == JsonValueKind.Array &&
                choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("message", out var message) &&
                message.TryGetProperty("content", out var content) &&
                content.ValueKind == JsonValueKind.String)
            {
                var text = content.GetString()?.Trim();
                if (!string.IsNullOrEmpty(text))
                {
                    return text;
                }
            }
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("Jawaban gateway AI tidak valid.", ex);
        }

        throw new InvalidOperationException("Gateway AI tidak mengembalikan draft.");
    }
}
