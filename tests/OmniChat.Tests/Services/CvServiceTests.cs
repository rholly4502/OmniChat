using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Moq;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Infrastructure.Services;

namespace OmniChat.Tests.Services;

public class CvServiceTests
{
    private readonly Mock<IWebHostEnvironment> _env = new();

    private CvService CreateService(string directory)
    {
        _env.Setup(e => e.ContentRootPath).Returns(Path.GetTempPath());
        var options = Options.Create(new CvOptions { Directory = directory });
        return new CvService(_env.Object, options);
    }

    [Fact]
    public void List_ReturnsOnlyPdfsSorted()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "b.pdf"), "%PDF-1.4");
        File.WriteAllText(Path.Combine(dir.Path, "a.pdf"), "%PDF-1.4");
        File.WriteAllText(Path.Combine(dir.Path, "notes.txt"), "nope");

        var service = CreateService(dir.Path);
        var files = service.List();

        Assert.Equal(new[] { "a.pdf", "b.pdf" }, files);
    }

    [Fact]
    public void List_WhenDirectoryMissing_ReturnsEmpty()
    {
        var missing = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var service = CreateService(missing);
        Assert.Empty(service.List());
    }

    [Fact]
    public void Get_ReturnsBytesForExistingPdf()
    {
        using var dir = new TempDirectory();
        var path = Path.Combine(dir.Path, "cv.pdf");
        File.WriteAllText(path, "%PDF-1.4 …");

        var cv = CreateService(dir.Path).Get("cv.pdf");

        Assert.NotNull(cv);
        Assert.Equal("cv.pdf", cv!.FileName);
        Assert.NotEmpty(cv.Bytes);
    }

    [Theory]
    [InlineData("../secrets.pdf")]
    [InlineData("sub/cv.pdf")]
    [InlineData("cv.txt")]
    [InlineData("")]
    public void Get_RejectsTraversalAndNonPdf(string name)
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "cv.pdf"), "%PDF-1.4");
        Assert.Null(CreateService(dir.Path).Get(name));
    }

    [Fact]
    public void Get_MissingFile_ReturnsNull()
    {
        using var dir = new TempDirectory();
        Assert.Null(CreateService(dir.Path).Get("missing.pdf"));
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "cvtests_" + Guid.NewGuid().ToString("N"));

        public TempDirectory() => Directory.CreateDirectory(Path);

        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { /* best effort */ }
        }
    }
}
