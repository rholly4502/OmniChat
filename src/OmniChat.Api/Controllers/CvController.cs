using Microsoft.AspNetCore.Mvc;
using OmniChat.Application.Interfaces;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Lists and downloads Rholly's CV files. Protected by the same auth as the rest of the
/// API (API key / JWT). Files live outside the public repo.
/// </summary>
[ApiController]
[Route("api/cv")]
public sealed class CvController : ControllerBase
{
    private readonly ICvService _cvService;

    public CvController(ICvService cvService) => _cvService = cvService;

    /// <summary>Lists available CV file names.</summary>
    [HttpGet]
    public IActionResult List() => Ok(_cvService.List());

    /// <summary>Downloads one CV file (PDF).</summary>
    [HttpGet("{fileName}")]
    public IActionResult Download(string fileName)
    {
        var cv = _cvService.Get(fileName);
        if (cv is null)
        {
            return NotFound();
        }

        return File(
            cv.Bytes,
            "application/pdf",
            fileDownloadName: cv.FileName);
    }
}
