# Implementation Plan: Milestone 5 — Observability & Production Readiness

**Date:** 2026-10-10
**Feature:** request logging, enriched health check, rate-limit coverage

## Context
Milestones 1–4 are complete and verified (build green 0 warnings, 38/38 tests passing, frontend
builds). Milestone 5 closes three gaps that matter for a real deployment, without adding any new
NuGet dependency (keeps the restore offline-safe and the build clean):

1. There is no per-request access log — we cannot see latency or status codes in production.
2. `/health` returns the bare `Healthy` text, useless for monitoring/uptime tooling.
3. The rate limiter (`per-ip`, 10 req/min) is untested — a regression would silently disable
   throttling.

## Tasks

### Task 1: Request logging middleware
- **Files:** `src/OmniChat.Api/Infrastructure/Middleware/RequestLoggingMiddleware.cs`,
  `tests/OmniChat.Tests/Middleware/RequestLoggingMiddlewareTests.cs`, `Program.cs`
- **Change:** Time each request with `Stopwatch` and emit one `Information` log line per request:
  method, path, status code, elapsed milliseconds and the correlation id (`context.TraceIdentifier`).
  Placed after `CorrelationIdMiddleware` so the id is populated. Always runs (finally block).
- **Test:** `_next` is invoked; response status is passed through untouched; a completion line
  containing the request path is logged.

### Task 2: Enriched `/health` response
- **Files:** `src/OmniChat.Api/Infrastructure/Health/ServiceStartTime.cs`,
  `src/OmniChat.Api/Infrastructure/Health/HealthResponseWriter.cs`, `Program.cs`,
  `tests/OmniChat.Tests/Health/HealthResponseWriterTests.cs`
- **Change:** Replace the default text writer with a JSON writer returning
  `{ status, version, uptimeSeconds, checks:[{ name, status }] }`. Uptime comes from a singleton
  `ServiceStartTime`. Status code semantics (200 when healthy) are unchanged so existing tests hold.
- **Test:** Writer emits `application/json` with the report status and a non-negative uptime.

### Task 3: Rate-limit integration coverage
- **Files:** `tests/OmniChat.Tests/Integration/RateLimitIntegrationTests.cs`
- **Change:** Exercise the `per-ip` token bucket end-to-end: 10 fast (400) requests consume the
  bucket, the 11th returns `429 TooManyRequests`.
- **Test:** As above; also assert the first request is not yet throttled.

### Task 4: Regression + docs
- **Change:** Full `dotnet build` + `dotnet test`; update README feature list and milestone table.
- **Test:** Build 0 warnings, all tests green.
- **Commit:** `docs: document Milestone 5 observability additions`
