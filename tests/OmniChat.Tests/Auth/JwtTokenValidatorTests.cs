using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using OmniChat.Api.Infrastructure.Auth;

namespace OmniChat.Tests.Auth;

public class JwtTokenValidatorTests
{
    private const string Key = "test-signing-key-that-is-long-enough-1234567890";
    private const string Issuer = "OmniChat";
    private const string Audience = "OmniChat";

    private static JwtOptions Options(string? key = Key, string issuer = Issuer, string audience = Audience) =>
        new() { SigningKey = key, Issuer = issuer, Audience = audience };

    private static string MakeToken(
        string key = Key,
        string issuer = Issuer,
        string audience = Audience,
        DateTime? expires = null,
        DateTime? notBefore = null,
        string subject = "tester")
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, subject)],
            notBefore: notBefore ?? DateTime.UtcNow.AddMinutes(-1),
            expires: expires ?? DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [Fact]
    public void NoSigningKey_IsDisabled()
    {
        Assert.False(new JwtTokenValidator(Options(key: null)).IsEnabled);
    }

    [Fact]
    public void Disabled_ReturnsFalse()
    {
        var validator = new JwtTokenValidator(Options(key: null));
        Assert.False(validator.TryValidate(MakeToken(), out var principal));
        Assert.Null(principal);
    }

    [Fact]
    public void ValidToken_ReturnsTrueWithSubject()
    {
        var validator = new JwtTokenValidator(Options());
        Assert.True(validator.TryValidate(MakeToken(), out var principal));
        Assert.Equal("tester", principal!.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
    }

    [Fact]
    public void ExpiredToken_ReturnsFalse()
    {
        var validator = new JwtTokenValidator(Options());
        var token = MakeToken(
            notBefore: DateTime.UtcNow.AddMinutes(-20),
            expires: DateTime.UtcNow.AddMinutes(-10));
        Assert.False(validator.TryValidate(token, out _));
    }

    [Fact]
    public void WrongSigningKey_ReturnsFalse()
    {
        var validator = new JwtTokenValidator(Options());
        var token = MakeToken(key: "a-different-signing-key-0987654321-abcdefgh");
        Assert.False(validator.TryValidate(token, out _));
    }

    [Fact]
    public void WrongIssuer_ReturnsFalse()
    {
        var validator = new JwtTokenValidator(Options());
        Assert.False(validator.TryValidate(MakeToken(issuer: "SomeoneElse"), out _));
    }

    [Fact]
    public void WrongAudience_ReturnsFalse()
    {
        var validator = new JwtTokenValidator(Options());
        Assert.False(validator.TryValidate(MakeToken(audience: "SomeoneElse"), out _));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-jwt")]
    [InlineData("a.b.c")]
    public void MalformedToken_ReturnsFalse(string token)
    {
        var validator = new JwtTokenValidator(Options());
        Assert.False(validator.TryValidate(token, out _));
    }
}
