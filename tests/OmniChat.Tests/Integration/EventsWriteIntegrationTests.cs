using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Exercises the promo/event write endpoints over the real HTTP pipeline: auth
/// (401 without API key) and create as well as update/delete against a real SQLite file.
/// </summary>
public sealed class EventsWriteIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Secret = "integration-secret";
    private readonly WebApplicationFactory<Program> _factory;

    public EventsWriteIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

    private HttpClient NewClient(string dbPath) =>
        _factory.WithWebHostBuilder(b => b
            .UseSetting("Security:ApiKey", Secret)
            .UseSetting("Persistence:ConnectionString", $"Data Source={dbPath}"))
        .CreateClient();

    private static HttpClient Authorized(HttpClient client)
    {
        client.DefaultRequestHeaders.Add("X-Api-Key", Secret);
        return client;
    }

    private static string TempDb() => Path.Combine(Path.GetTempPath(), $"events-write-int-{Guid.NewGuid():N}.db");

    private static object Payload(string aplikasi = "GoPay", string judul = "Cashback 20%", string ditemukan = "2026-11-14") =>
        new
        {
            aplikasi,
            judul,
            benefit = "Cashback 20%",
            syarat = "Min. transaksi 50rb",
            link = "https://gopay.id",
            berlakuSampai = "31 Des 2026",
            ditemukan,
        };

    [Fact]
    public async Task Create_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.PostAsJsonAsync("/api/events", Payload());

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Create_WithApiKey_PersistsAndListReturnsIt()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));

            var create = await client.PostAsJsonAsync("/api/events", Payload());
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var createdJson = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();
            Assert.StartsWith("web-", createdJson.RootElement.GetProperty("sourceId").GetString());

            var list = await client.GetAsync("/api/events");
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            using var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            var items = listJson.RootElement;
            Assert.Equal(1, items.GetArrayLength());
            Assert.Equal(id, items[0].GetProperty("id").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task UpdateAndDelete_WithApiKey_WorkEndToEnd()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));

            var create = await client.PostAsJsonAsync("/api/events", Payload());
            var createdJson = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();

            var update = await client.PutAsJsonAsync($"/api/events/{id}", Payload(judul: "Judul Baru"));
            Assert.Equal(HttpStatusCode.OK, update.StatusCode);
            var updatedJson = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
            Assert.Equal("Judul Baru", updatedJson.RootElement.GetProperty("judul").GetString());

            var del = await client.DeleteAsync($"/api/events/{id}");
            Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

            var list = await client.GetAsync("/api/events");
            var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert.Equal(0, listJson.RootElement.GetArrayLength());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Update_UnknownId_ReturnsNotFound()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.PutAsJsonAsync("/api/events/999999", Payload());
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }
}
