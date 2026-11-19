using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

/// <summary>
/// Decides whether the current request may read stored chat history.
/// </summary>
public interface IChatAccessPolicy
{
    /// <summary>Resolves the access level for <paramref name="context"/>.</summary>
    ChatAccess Resolve(HttpContext context);
}
