namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Configuration for the CV file service.
/// </summary>
public sealed class CvOptions
{
    public const string SectionName = "Cv";

    /// <summary>Directory containing CV PDFs. Relative to the content root when not rooted.</summary>
    public string Directory { get; set; } = "cv";
}
