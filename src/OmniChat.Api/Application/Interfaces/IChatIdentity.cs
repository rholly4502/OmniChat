namespace OmniChat.Application.Interfaces;

/// <summary>
/// Resolves the authenticated user identity from an HTTP context.
/// </summary>
public interface IChatIdentity
{
    /// <summary>Resolves the user id for <paramref name="context"/>, or null if anonymous.</summary>
    string ResolveUserId(HttpContext context);
}
