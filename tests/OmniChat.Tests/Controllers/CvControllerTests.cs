using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Application.Interfaces;

namespace OmniChat.Tests.Controllers;

public class CvControllerTests
{
    private readonly Mock<ICvService> _service = new();

    private CvController CreateController() => new(_service.Object);

    [Fact]
    public void List_ReturnsFileNames()
    {
        _service.Setup(s => s.List()).Returns(new[] { "a.pdf", "b.pdf" });

        var result = CreateController().List() as OkObjectResult;

        Assert.NotNull(result);
        Assert.Equal(new[] { "a.pdf", "b.pdf" }, result!.Value);
    }

    [Fact]
    public void Download_ReturnsPdfFile()
    {
        _service.Setup(s => s.Get("cv.pdf"))
            .Returns(new CvFile("cv.pdf", [0x25, 0x50, 0x44, 0x46]));

        var result = CreateController().Download("cv.pdf") as FileContentResult;

        Assert.NotNull(result);
        Assert.Equal("application/pdf", result!.ContentType);
        Assert.Equal("cv.pdf", result.FileDownloadName);
        Assert.Equal(4, result.FileContents.Length);
    }

    [Fact]
    public void Download_UnknownFile_ReturnsNotFound()
    {
        _service.Setup(s => s.Get("ghost.pdf")).Returns((CvFile?)null);

        var result = CreateController().Download("ghost.pdf");

        Assert.IsType<NotFoundResult>(result);
    }
}
