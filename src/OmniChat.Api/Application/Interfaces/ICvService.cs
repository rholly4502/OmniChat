namespace OmniChat.Application.Interfaces;

/// <summary>
/// One CV file available for download.
/// </summary>
/// <param name="FileName">File name (e.g. "Rholly-CV-EN-MYSG.pdf").</param>
/// <param name="Bytes">File content.</param>
public sealed record CvFile(string FileName, byte[] Bytes);

/// <summary>
/// Serves Rholly's CV files (PDF) for authenticated download. Files live outside the
/// repository (a bind-mounted folder, ignored by git) so personal data never enters
/// the public repo.
/// </summary>
public interface ICvService
{
    /// <summary>Lists available CV file names, sorted.</summary>
    IReadOnlyList<string> List();

    /// <summary>Gets one CV by file name, or null when it does not exist.</summary>
    CvFile? Get(string fileName);
}
