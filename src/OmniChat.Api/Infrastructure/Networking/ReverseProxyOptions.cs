namespace OmniChat.Api.Infrastructure.Networking;

/// <summary>
/// Configuration for running behind a reverse proxy (nginx, Caddy, Traefik, …).
/// When <see cref="Enabled"/> is true the app processes
/// <c>X-Forwarded-For</c>/<c>X-Forwarded-Proto</c> headers from the proxies listed
/// in <see cref="KnownProxies"/> / <see cref="KnownNetworks"/> so that the client IP
/// (used by the per-IP rate limiter and request logging) and the request scheme are
/// reported correctly instead of always showing the proxy's own address.
/// </summary>
public sealed class ReverseProxyOptions
{
    public const string SectionName = "ReverseProxy";

    /// <summary>
    /// Master switch. Default <c>false</c>: forwarded headers are ignored entirely,
    /// so an existing deployment is never affected unless it explicitly opts in.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// IP addresses of trusted proxies. The ASP.NET Core loopback defaults are kept,
    /// so a local proxy still works; only the entries here are added.
    /// </summary>
    public string[] KnownProxies { get; set; } = [];

    /// <summary>
    /// Trusted proxy networks in CIDR form (e.g. <c>172.18.0.0/16</c> — the Docker
    /// bridge network). Entries are added to the loopback defaults.
    /// </summary>
    public string[] KnownNetworks { get; set; } = [];

    /// <summary>
    /// Maximum number of forwarded entries to process. <c>1</c> (default) means only
    /// the entry added by the closest trusted proxy is used. Values &lt;= 0 disable
    /// the limit (use with care).
    /// </summary>
    public int ForwardLimit { get; set; } = 1;
}
