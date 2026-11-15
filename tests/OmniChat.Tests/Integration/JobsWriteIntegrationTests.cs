using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniChat.Tests.Integration;

/// <summary>
/// Exercises the job-opportunity write endpoints over the real HTTP pipeline: auth
/// (401 without API key) and create plus update/delete against a real SQLite file.
/// </summary>
public sealed class JobsWriteIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Secret = "integration-secret";
    private readonly WebApplicationFactory<Program> _factory;

    public JobsWriteIntegrationTests(WebApplicationFactory<Program> factory) => _factory = factory;

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

    private static string TempDb() => Path.Combine(Path.GetTempPath(), $"jobs-write-int-{Guid.NewGuid():N}.db");

    private static object Payload(string judul = ".NET Developer", string perusahaan = "PT Contoh", string lokasi = "Remote", string ditemukan = "2026-11-14") =>
        new
        {
            judul,
            perusahaan,
            lokasi,
            tipe = "Kontrak",
            gaji = "15-20jt",
            skor = (int?)null,
            link = "https://contoh.dev/lowongan",
            catatan = "kotak .NET",
            status = "new",
            followUpTanggal = (string?)null,
            ditemukan,
        };

    [Fact]
    public async Task Create_requiresApiKey()
    {
        var db = TempDb();
        try
        {
            var client = NewClient(db);
            var response = await client.PostAsJsonAsync("/api/jobs", Payload());

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

            var create = await client.PostAsJsonAsync("/api/jobs", Payload());
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var createdJson = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();
            Assert.StartsWith("web-", createdJson.RootElement.GetProperty("sourceId").GetString());

            var list = await client.GetAsync("/api/jobs");
            Assert.Equal(HttpStatusCode.OK, list.StatusCode);
            using var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert.Equal(1, listJson.RootElement.GetArrayLength());
            Assert.Equal(id, listJson.RootElement[0].GetProperty("id").GetInt64());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Create_ValidationFailure_Returns400()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.PostAsJsonAsync("/api/jobs", Payload(perusahaan: ""));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Update_WithApiKey_ChangesFields()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var create = await client.PostAsJsonAsync("/api/jobs", Payload());
            using var createdJson = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();

            var update = await client.PutAsJsonAsync($"/api/jobs/{id}", Payload(judul: ".NET Dev Senior"));
            Assert.Equal(HttpStatusCode.OK, update.StatusCode);
            using var updatedJson = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
            Assert.Equal(".NET Dev Senior", updatedJson.RootElement.GetProperty("judul").GetString());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Update_UnknownId_Returns404()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.PutAsJsonAsync("/api/jobs/999999", Payload());

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Delete_WithApiKey_RemovesRow()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var create = await client.PostAsJsonAsync("/api/jobs", Payload());
            using var createdJson = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var id = createdJson.RootElement.GetProperty("id").GetInt64();

            var del = await client.DeleteAsync($"/api/jobs/{id}");
            Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

            var list = await client.GetAsync("/api/jobs");
            using var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert.Equal(0, listJson.RootElement.GetArrayLength());
        }
        finally { File.Delete(db); }
    }

    [Fact]
    public async Task Delete_UnknownId_Returns404()
    {
        var db = TempDb();
        try
        {
            var client = Authorized(NewClient(db));
            var response = await client.DeleteAsync("/api/jobs/999999");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally { File.Delete(db); }
    }
}
