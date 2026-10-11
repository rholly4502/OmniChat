using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using OmniChat.Api.Infrastructure.Networking;

namespace OmniChat.Tests.Networking;

/// <summary>
/// Unit tests for <see cref="ForwardedHeadersSetup"/>. They pin the trust rules that
/// keep forwarded-header processing safe: which headers are honoured, that only
/// configured proxies/networks are trusted, that the loopback defaults survive, and
/// that malformed configuration is ignored instead of failing startup.
/// </summary>
public class ForwardedHeadersSetupTests
{
    [Fact]
    public void Apply_EnablesForwardedForAndProtoHeaders()
    {
        var options = new ForwardedHeadersOptions();

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions());

        Assert.True(options.ForwardedHeaders.HasFlag(ForwardedHeaders.XForwardedFor));
        Assert.True(options.ForwardedHeaders.HasFlag(ForwardedHeaders.XForwardedProto));
    }

    [Fact]
    public void Apply_AddsConfiguredProxies()
    {
        var options = new ForwardedHeadersOptions();

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { KnownProxies = ["10.0.0.5", " 10.0.0.6 "] });

        Assert.Contains(IPAddress.Parse("10.0.0.5"), options.KnownProxies);
        Assert.Contains(IPAddress.Parse("10.0.0.6"), options.KnownProxies);
    }

    [Fact]
    public void Apply_AddsConfiguredNetworks()
    {
        var options = new ForwardedHeadersOptions();

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { KnownNetworks = ["172.18.0.0/16"] });

        Assert.Contains(options.KnownIPNetworks,
            n => n.BaseAddress.Equals(IPAddress.Parse("172.18.0.0")) && n.PrefixLength == 16);
    }

    [Fact]
    public void Apply_PreservesLoopbackDefaults()
    {
        var options = new ForwardedHeadersOptions();
        var defaultProxies = options.KnownProxies.Count;
        var defaultNetworks = options.KnownIPNetworks.Count;

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions
        {
            KnownProxies = ["10.0.0.5"],
            KnownNetworks = ["10.0.0.0/8"],
        });

        // Configured entries are ADDED, never replace the loopback trust the framework ships.
        Assert.True(options.KnownProxies.Count > defaultProxies);
        Assert.True(options.KnownIPNetworks.Count > defaultNetworks);
        Assert.Contains(IPAddress.IPv6Loopback, options.KnownProxies);
        Assert.Contains(options.KnownIPNetworks, n => n.BaseAddress.Equals(IPAddress.Parse("127.0.0.0")));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-ip")]
    [InlineData("999.1.1.1")]
    public void Apply_IgnoresInvalidProxyEntries(string value)
    {
        var options = new ForwardedHeadersOptions();
        var before = options.KnownProxies.Count;

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { KnownProxies = [value] });

        Assert.Equal(before, options.KnownProxies.Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("10.0.0.0")]      // no /length
    [InlineData("10.0.0.0/")]     // missing length
    [InlineData("10.0.0.0/33")]   // out of range for IPv4
    [InlineData("10.0.0.0/-1")]   // negative prefix
    [InlineData("nope/8")]        // unparsable address
    [InlineData("10.0.0.0/abc")]  // unparsable length
    public void Apply_IgnoresInvalidNetworkEntries(string value)
    {
        var options = new ForwardedHeadersOptions();
        var before = options.KnownIPNetworks.Count;

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { KnownNetworks = [value] });

        Assert.Equal(before, options.KnownIPNetworks.Count);
    }

    [Fact]
    public void Apply_SetsForwardLimitFromOptions()
    {
        var options = new ForwardedHeadersOptions();

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { ForwardLimit = 3 });

        Assert.Equal(3, options.ForwardLimit);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Apply_NonPositiveForwardLimit_DisablesLimit(int limit)
    {
        var options = new ForwardedHeadersOptions();

        ForwardedHeadersSetup.Apply(options, new ReverseProxyOptions { ForwardLimit = limit });

        Assert.Null(options.ForwardLimit);
    }

    [Fact]
    public void Bind_FromConfiguration_AppliesProxiesAndNetworks()
    {
        // Proves the real production path: env vars (ReverseProxy__KnownNetworks__0=favicon...)
        // bind to ReverseProxyOptions, which then configures the middleware options.
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ReverseProxy:Enabled"] = "true",
            ["ReverseProxy:KnownProxies:0"] = "10.0.0.5",
            ["ReverseProxy:KnownNetworks:0"] = "172.18.0.0/16",
            ["ReverseProxy:ForwardLimit"] = "2",
        }).Build();

        var proxy = config.GetSection(ReverseProxyOptions.SectionName).Get<ReverseProxyOptions>();
        Assert.NotNull(proxy);
        Assert.True(proxy!.Enabled);

        var options = new ForwardedHeadersOptions();
        ForwardedHeadersSetup.Apply(options, proxy);

        Assert.Contains(IPAddress.Parse("10.0.0.5"), options.KnownProxies);
        Assert.Contains(options.KnownIPNetworks,
            n => n.BaseAddress.Equals(IPAddress.Parse("172.18.0.0")) && n.PrefixLength == 16);
        Assert.Equal(2, options.ForwardLimit);
    }

    [Fact]
    public void Apply_NullArguments_Throw()
    {
        Assert.Throws<ArgumentNullException>(() => ForwardedHeadersSetup.Apply(null!, new ReverseProxyOptions()));
        Assert.Throws<ArgumentNullException>(() => ForwardedHeadersSetup.Apply(new ForwardedHeadersOptions(), null!));
    }

    [Fact]
    public void TryParseProxy_ValidAddress_TrimsAndParses()
    {
        Assert.True(ForwardedHeadersSetup.TryParseProxy(" 192.168.1.1 ", out var ip));
        Assert.Equal(IPAddress.Parse("192.168.1.1"), ip);
    }

    [Fact]
    public void TryParseProxy_InvalidOrBlank_ReturnsFalse()
    {
        Assert.False(ForwardedHeadersSetup.TryParseProxy("nope", out _));
        Assert.False(ForwardedHeadersSetup.TryParseProxy(null, out _));
        Assert.False(ForwardedHeadersSetup.TryParseProxy("", out _));
    }

    [Fact]
    public void TryParseNetwork_ValidCidr_ReturnsMaskedNetwork()
    {
        Assert.True(ForwardedHeadersSetup.TryParseNetwork("10.1.2.3/8", out var network));
        Assert.Equal(IPAddress.Parse("10.0.0.0"), network.BaseAddress);
        Assert.Equal(8, network.PrefixLength);
    }

    [Fact]
    public void TryParseNetwork_Ipv6Cidr_ReturnsTrue()
    {
        Assert.True(ForwardedHeadersSetup.TryParseNetwork("2001:db8::/32", out var network));
        Assert.Equal(32, network.PrefixLength);
    }
}
