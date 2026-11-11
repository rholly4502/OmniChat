namespace OmniChat.Application.Interfaces;

/// <summary>
/// A generated application (cover-letter) draft for one curated opportunity.
/// </summary>
/// <param name="CoverLetter">The draft cover letter text (markdown/text).</param>
/// <param name="Model">Model id that produced the draft.</param>
public sealed record LamaranDraft(string CoverLetter, string Model);

/// <summary>
/// Generates a tailored first-draft cover letter for a job opportunity by sending the
/// opportunity details plus Rholly's profile to the Hermes gateway. The output is a
/// draft for Rholly to review and finalize — never an auto-submission.
/// </summary>
public interface ILamaranDraftService
{
    /// <summary>
    /// Builds a draft cover letter for the opportunity with the given id.
    /// </summary>
    /// <returns><c>null</c> when the opportunity does not exist; otherwise a draft.</returns>
    /// <exception cref="InvalidOperationException">The AI gateway call failed.</exception>
    Task<LamaranDraft?> GenerateAsync(long opportunityId, CancellationToken cancellationToken);
}
