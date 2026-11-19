using OmniChat.Application.Interfaces;

namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Adapter ke <see cref="ChatIdentity"/> statis agar Controller bergantung pada abstraksi
/// Application, bukan implementasi Infrastructure.
/// </summary>
public sealed class ChatIdentityAdapter : IChatIdentity
{
    public string ResolveUserId(HttpContext context) => ChatIdentity.ResolveUserId(context);
}
