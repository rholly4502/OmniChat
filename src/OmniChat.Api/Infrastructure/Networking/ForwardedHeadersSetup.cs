using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
// `IPNetwork` exists in both System.Net and Microsoft.AspNetCore.HttpOverrides;
// .NET 10 deprecates the latter, so bind unambiguously to the BCL type.
using IPNetwork = System.Net.IPNetwork;

namespace OmniChat.Api.Infrastructure.Networking;

/// <summary>
/// Builds the <see cref="ForwardedHeadersOptions"/> used by <c>UseForwardedHeaders</c>
/// from <see cref="ReverseProxyOptions"/>. Kept as a pure, static helper so the parsing
/// and trust rules are unit-testable without booting the application.
/// </summary>
public static class ForwardedHeadersSetup
{
    /// <summary>
    /// Applies <paramref name="proxy"/> to <paramref name="options"/>. The built-in
    /// loopback trusted proxies/networks are preserved; configured entries are ADDED.
    /// Trust is therefore never widened to an unlisted source — a spoofed
    /// <c>X-Forwarded-For</c> from an untrusted peer is still ignored by the middleware.
    /// </summary>
    public static void Apply(ForwardedHeadersOptions options, ReverseProxyOptions proxy)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(proxy);

        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = proxy.ForwardLimit > 0 ? proxy.ForwardLimit : null;

        foreach (var raw in proxy.KnownProxies)
        {
            if (TryParseProxy(raw, out var address))
                options.KnownProxies.Add(address);
        }

        foreach (var raw in proxy.KnownNetworks)
        {
            if (TryParseNetwork(raw, out var network))
                options.KnownIPNetworks.Add(network);
        }
    }

    /// <summary>Parses a bare IP address; blank or invalid input returns <c>false</c>.</summary>
    public static bool TryParseProxy(string? value, out IPAddress address)
    {
        address = IPAddress.None;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!IPAddress.TryParse(value.Trim(), out var parsed))
            return false;

        address = parsed;
        return true;
    }

    /// <summary>
    /// Parses a CIDR string such as <c>10.0.0.0/8</c> or <c>2001:db8::/32</c>;
    /// blank or invalid input (bad address, missing length, out-of-range prefix)
    /// returns <c>false</c>.
    /// </summary>
    public static bool TryParseNetwork(string? value, out IPNetwork network)
    {
        network = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var parts = value.Trim().Split('/', StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !IPAddress.TryParse(parts[0], out var baseAddress))
            return false;

        if (!int.TryParse(parts[1], out var prefixLength))
            return false;

        var maxLength = baseAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 ? 128 : 32;
        if (prefixLength < 0 || prefixLength > maxLength)
            return false;

        network = new IPNetwork(baseAddress, prefixLength);
        return true;
    }
}
