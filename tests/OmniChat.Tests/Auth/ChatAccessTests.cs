using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Api.Infrastructure.Middleware;

namespace OmniChat.Tests.Auth;

/// <summary>
/// Tests for the read-side authorisation split. Filing a turn is unconditional; reading it back is
/// not. The failure mode this pins is the expensive one: a JWT holder with no admin listing
/// silently reading the operator's history.
/// </summary>
public class ChatAccessTests
{
    private static HttpContext WithSubject(params Claim[] claims)
    {
        var context = new DefaultHttpContext();
        var identity = new ClaimsIdentity(claims, "Bearer");
        context.Items[JwtAuthenticationMiddleware.AuthenticatedItemKey] = new ClaimsPrincipal(identity);
        return context;
    }

    private static IConfiguration Config(params (string Key, string Value)[] pairs)
    {
        var values = pairs.ToDictionary(pair => pair.Key, pair => (string?)pair.Value);
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static HttpContext WithApiKeyAuth()
    {
        var context = new DefaultHttpContext();
        context.Items[ApiKeyMiddleware.ApiKeyAuthenticatedItemKey] = true;
        return context;
    }

    [Fact]
    public void ResolveAccess_GrantsAdmin_ToApiKeyCallers()
    {
        // An API-key-authenticated request carries the operator credential.
        Assert.Equal(ChatAccess.Admin, ChatIdentity.ResolveAccess(WithApiKeyAuth(), []));
    }

    [Fact]
    public void ResolveAccess_ResolvesAnonymousCallers_AsGuest()
    {
        // The guest-mode security boundary: an unauthenticated caller (no JWT, no API key)
        // must be treated as a guest, never as the operator.
        Assert.Equal(ChatAccess.Guest, ChatIdentity.ResolveAccess(new DefaultHttpContext(), []));
    }

    [Fact]
    public void ResolveAccess_GrantsAdmin_WhenTheSubjectIsListed()
    {
        var context = WithSubject(new Claim("sub", "user-42"));

        Assert.Equal(ChatAccess.Admin, ChatIdentity.ResolveAccess(context, ["user-42"]));
    }

    [Fact]
    public void ResolveAccess_MatchesSubjectsCaseInsensitively()
    {
        var context = WithSubject(new Claim("sub", "User-42"));

        Assert.Equal(ChatAccess.Admin, ChatIdentity.ResolveAccess(context, ["user-42"]));
    }

    [Fact]
    public void ResolveAccess_DeniesAGuest_WhenTheSubjectIsNotListed()
    {
        var context = WithSubject(new Claim("sub", "user-42"));

        Assert.Equal(ChatAccess.Guest, ChatIdentity.ResolveAccess(context, ["someone-else"]));
    }

    [Fact]
    public void ResolveAccess_DeniesEveryone_WhenNoAdminSubjectsAreConfigured()
    {
        // The safe default: enabling JWT support must not turn every token holder into an operator.
        var context = WithSubject(new Claim("sub", "user-42"));

        Assert.Equal(ChatAccess.Guest, ChatIdentity.ResolveAccess(context, null));
        Assert.Equal(ChatAccess.Guest, ChatIdentity.ResolveAccess(context, []));
    }

    [Fact]
    public void ResolveAccess_DeniesAGuest_WhenTheTokenCarriesNoSubject()
    {
        var context = WithSubject(new Claim("scope", "chat"));

        Assert.Equal(ChatAccess.Guest, ChatIdentity.ResolveAccess(context, ["user-42"]));
    }

    [Fact]
    public void ResolveAccess_RejectsANullContext()
    {
        Assert.Throws<ArgumentNullException>(() => ChatIdentity.ResolveAccess(null!, []));
    }

    [Fact]
    public void ReadAdminSubjects_AcceptsAnIndexedArray()
    {
        var configuration = Config(
            ("Security:AdminSubjects:0", "alice"),
            ("Security:AdminSubjects:1", "bob"));

        Assert.Equal(["alice", "bob"], ChatAccessPolicy.ReadAdminSubjects(configuration));
    }

    [Fact]
    public void ReadAdminSubjects_SplitsACommaSeparatedValue()
    {
        // An .env-based deployment can only express the list as one string.
        var configuration = Config(("Security:AdminSubjects", "alice, bob"));

        Assert.Equal(["alice", "bob"], ChatAccessPolicy.ReadAdminSubjects(configuration));
    }

    [Fact]
    public void ReadAdminSubjects_SplitsASemicolonSeparatedValue()
    {
        var configuration = Config(("Security:AdminSubjects", "alice;bob"));

        Assert.Equal(["alice", "bob"], ChatAccessPolicy.ReadAdminSubjects(configuration));
    }

    [Fact]
    public void ReadAdminSubjects_DropsBlanksAndDuplicates()
    {
        var configuration = Config(("Security:AdminSubjects", " alice , ,ALICE,bob, "));

        Assert.Equal(["alice", "bob"], ChatAccessPolicy.ReadAdminSubjects(configuration));
    }

    [Fact]
    public void ReadAdminSubjects_ReturnsEmpty_WhenTheSectionIsAbsent()
    {
        Assert.Empty(ChatAccessPolicy.ReadAdminSubjects(Config()));
    }

    [Fact]
    public void ChatAccessPolicy_ResolvesThroughTheConfigurationBackedList()
    {
        var policy = new ChatAccessPolicy(Config(("Security:AdminSubjects", "alice")));

        Assert.Equal(ChatAccess.Admin, policy.Resolve(WithSubject(new Claim("sub", "alice"))));
        Assert.Equal(ChatAccess.Guest, policy.Resolve(WithSubject(new Claim("sub", "mallory"))));
        Assert.Equal(ChatAccess.Admin, policy.Resolve(WithApiKeyAuth()));
        Assert.Equal(ChatAccess.Guest, policy.Resolve(new DefaultHttpContext()));
    }

    [Fact]
    public void ChatAccessPolicy_RejectsANullConfiguration()
    {
        Assert.Throws<ArgumentNullException>(() => new ChatAccessPolicy(null!));
    }
}
