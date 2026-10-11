# Milestone 16 — Reverse-Proxy Forwarded Headers

Date: 2026-10-11

## Problem

When OmniChat runs behind a reverse proxy (nginx/Caddy/Traefik — the documented
deployment), every request reaches the backend from the **proxy's** IP. Two
consequences:

1. The per-IP rate limiter (`per-ip` token bucket, 10 req/min) partitions on the
   proxy address, so **all clients share a single bucket** and the limit is
   effectively global.
2. `RequestLoggingMiddleware` logs the proxy address instead of the real caller.

The nginx example in `docs/deployment.md` already sets `X-Forwarded-For`, but the
application never read it.

## Goal

Opt-in, safe processing of `X-Forwarded-For` / `X-Forwarded-Proto` so the client
IP and scheme are correct behind a proxy — without opening an IP-spoofing hole.

## Design

- New `ReverseProxy` config section bound to `ReverseProxyOptions`.
  - `Enabled` (default `false`) — master switch; a direct deployment is unaffected.
  - `KnownProxies` (string[]) — trusted proxy IPs (added to the loopback defaults).
  - `KnownNetworks` (string[]) — trusted proxy CIDRs, e.g. the Docker bridge `172.18.0.0/16`.
  - `ForwardLimit` (default `1`) — only the closest proxy's entry is honoured.
- `ForwardedHeadersSetup.Apply(options, proxy)` — pure static helper that maps the
  section onto `ForwardedHeadersOptions`. Trust is **additive**: the framework's
  loopback defaults are preserved, so an untrusted peer's `X-Forwarded-For` is still
  ignored (`IsTrustedProxy` check). Malformed entries are skipped, never fatal.
- `Program.cs` calls `app.UseForwardedHeaders()` **before** `UseResponseCompression`
  and, critically, before `UseRateLimiter()`.
- `StartupConfigValidator` warns in Production when `ReverseProxy:Enabled=true` but
  no trusted proxy/network is configured.

## .NET 10 API notes (verified against the SDK)

- `ForwardedHeadersOptions` lives in `Microsoft.AspNetCore.Builder`, NOT
  `Microsoft.AspNetCore.HttpOverrides` (Web SDK implicit usings hid this).
- `ForwardedHeadersOptions.KnownNetworks` is obsolete (ASPDEPR005); use
  `KnownIPNetworks` with `System.Net.IPNetwork`.
- `System.Net.IPNetwork(IPAddress, int)` masks host bits, never throws for them.

## Tasks

1. Add `ReverseProxyOptions` + `ForwardedHeadersSetup` (unit-tested in isolation).
2. Wire options + `UseForwardedHeaders()` into `Program.cs` (ordering guarded by test).
3. Add the `ReverseProxy` section to `appsettings*.json`; forward the vars from
   `docker-compose.yml`; document in `.env.example`, `README.md`, `docs/deployment.md`.
4. Add the production startup warning to `StartupConfigValidator`.
5. Tests: helper unit tests + config-binding test, 3 validator tests, 7 deployment
   guards (including the forwarded-headers-before-rate-limiter ordering guard).

## Verification

`dotnet build OmniChat.slnx -c Release` (0 warnings) · `dotnet test` (184 passing) ·
`npm run build` (frontend) · CI green.

## Rulings

- **Keep loopback defaults.** Clearing `KnownProxies`/`KnownNetworks` would make the
  middleware trust *any* source — a spoofing hole. Configured entries are added.
- **No `TrustAll` escape hatch.** YAGNI + security; list the proxy explicitly.
- **Default `Enabled=false`.** Backwards compatible; opt in per deployment.
