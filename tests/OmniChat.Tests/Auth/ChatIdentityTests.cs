using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Auth;

/// <summary>
/// Tests for the owner tag conversations are filed under. Getting this wrong files two people's
/// turns into one history, which is why the JWT branch is pinned rather than assumed.
/// </summary>
public class ChatIdentityTests
{
    private static HttpContext WithPrincipal(params Claim[] claims)
    {
        var context = new DefaultHttpContext();
        var identity = new ClaimsIdentity(claims, "Bearer");
        context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] = new ClaimsPrincipal(identity);
        return context;
    }

    [Fact]
    public void ResolveUserId_UsesTheJwtSubject()
    {
        var context = WithPrincipal(new Claim("sub", "user-42"));

        Assert.Equal("user-42", ChatIdentity.ResolveUserId(context));
    }

    [Fact]
    public void ResolveUserId_FallsBackToAdmin_ForApiKeyCallers()
    {
        // An API key is shared, so it carries no identity. Those callers are the operator and
        // own the "admin" history rather than a per-token one.
        var context = new DefaultHttpContext();
        context.Items[ApiKeyMiddleware.ApiKeyAuthenticatedItemKey] = true;

        Assert.Equal(ChatIdentity.AdminUserId, ChatIdentity.ResolveUserId(context));
    }

    [Fact]
    public void ResolveUserId_FallsBackToGuest_ForAnonymousCallers()
    {
        // An anonymous caller with no credentials is a guest, filed under the shared guest tag.
        Assert.Equal(ChatIdentity.GuestUserId, ChatIdentity.ResolveUserId(new DefaultHttpContext()));
    }

    [Fact]
    public void ResolveUserId_FallsBackToGuest_WhenThePrincipalHasNoSubject()
    {
        // A JWT with no subject is not identifiable, so it files under the guest tag.
        var context = WithPrincipal(new Claim("scope", "chat"));

        Assert.Equal(ChatIdentity.GuestUserId, ChatIdentity.ResolveUserId(context));
    }

    [Fact]
    public void ResolveUserId_FallsBackToGuest_WhenTheSubjectIsBlank()
    {
        // A blank owner would make every repository call throw, turning each turn into a
        // warning instead of a recorded message. A guest tag still keeps the row writable.
        var context = WithPrincipal(new Claim("sub", "   "));

        Assert.Equal(ChatIdentity.GuestUserId, ChatIdentity.ResolveUserId(context));
    }

    [Fact]
    public void ResolveUserId_AcceptsTheMappedNameIdentifierClaim()
    {
        // JwtAuthenticationMiddleware disables inbound mapping so "sub" survives verbatim, but
        // a principal built elsewhere (tests, a future scheme) may only carry the mapped name.
        var context = WithPrincipal(new Claim(ClaimTypes.NameIdentifier, "user-7"));

        Assert.Equal("user-7", ChatIdentity.ResolveUserId(context));
    }

    [Fact]
    public void ResolveUserId_RejectsANullContext()
    {
        Assert.Throws<ArgumentNullException>(() => ChatIdentity.ResolveUserId(null!));
    }
}
