using Microsoft.Extensions.Options;
using OmniChat.Application.Interfaces;
using OmniChat.Api.Infrastructure.Options;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Reads CV files from a directory (supplied via <see cref="CvOptions.Directory"/>,
/// default "cv" under the content root). The directory is bind-mounted from the host and
/// git-ignored, so CVs never enter the public repository.
/// </summary>
public sealed class CvService : ICvService
{
    private static readonly string[] AllowedExtensions = [".pdf"];

    private readonly string _directory;

    public CvService(IWebHostEnvironment environment, IOptions<CvOptions> options)
    {
        var relative = string.IsNullOrWhiteSpace(options.Value.Directory)
            ? "cv"
            : options.Value.Directory;

        _directory = Path.IsPathRooted(relative)
            ? relative
            : Path.Combine(environment.ContentRootPath, relative);
    }

    public IReadOnlyList<string> List()
    {
        if (!Directory.Exists(_directory))
        {
            return [];
        }

        return Directory.EnumerateFiles(_directory)
            .Select(Path.GetFileName)
            .Where(name => name is not null && IsAllowed(name))
            .Select(name => name!)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public CvFile? Get(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || !IsAllowed(fileName))
        {
            return null;
        }

        // Reject path traversal (e.g. "../secret") — only a bare file name is accepted.
        if (!fileName.Equals(Path.GetFileName(fileName), StringComparison.Ordinal))
        {
            return null;
        }

        var fullPath = Path.Combine(_directory, fileName);
        if (!File.Exists(fullPath))
        {
            return null;
        }

        return new CvFile(fileName, File.ReadAllBytes(fullPath));
    }

    private static bool IsAllowed(string fileName) =>
        AllowedExtensions.Any(ext => fileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase));
}
