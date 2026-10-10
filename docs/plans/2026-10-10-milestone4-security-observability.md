# Implementation Plan: Milestone 4 — Security & Observability Hardening
**Date:** 2026-10-10
**Feature:** API-key authentication, correlation-ID tracing, configurable CORS, enriched health checks

## Context
Milestones 1–3 are complete and verified (build green 0 warnings, 16/16 tests passing, frontend builds).
OmniChat is functional but the API is wide open: any origin can call it, there is no caller
authentication, and logs cannot be correlated across a request. Milestone 4 hardens the API for a
real deployment without adding new NuGet dependencies (keeps the build clean).

## Tasks

### Task 1: API-key authentication middleware
- **Files:** `src/OmniChat.Api/Infrastructure/Middleware/ApiKeyMiddleware.cs`,
  `tests/OmniChat.Tests/Middleware/ApiKeyMiddlewareTests.cs`, `Program.cs`, `appsettings.json`
- **Change:** Guard `/api/*` with an `X-Api-Key` header when `Security:ApiKey` is configured.
  Compare with `CryptographicOperations.FixedTimeEquals` (constant-time) to avoid timing attacks.
  When no key is configured (dev/tests) the middleware is a pass-through. `/health` and `/openapi`
  are exempt.
- **Test:** Unit tests — key configured + missing header → 401; wrong key → 401; correct key → next
  invoked; no key configured → pass-through; `/health` exempt even with key configured.
- **Commit:** `feat: add API-key authentication middleware`

### Task 2: Correlation-ID middleware
- **Files:** `src/OmniChat.Api/Infrastructure/Middleware/CorrelationIdMiddleware.cs`,
  `tests/OmniChat.Tests/Middleware/CorrelationIdMiddlewareTests.cs`, `Program.cs`
- **Change:** Read `X-Correlation-Id` from the request or generate a GUID; echo it on the response and
  push it into the logging scope so every log line for the request carries the same id.
- **Test:** Unit tests — generated id is non-empty and echoed; provided id is preserved; log scope set.
- **Commit:** `feat: add correlation-id middleware for request tracing`

### Task 3: Configurable CORS policy
- **Files:** `Program.cs`, `appsettings.Development.json`, `appsettings.Production.json`
- **Change:** Replace hard-coded `AllowAll` with an `AppPolicy` driven by `Cors:AllowedOrigins`.
  Configured origins are honoured with credentials; if the list is empty it falls back to AllowAll.
- **Test:** Integration test — request with an allowed `Origin` receives the matching
  `Access-Control-Allow-Origin` header.
- **Commit:** `feat: make CORS policy configurable per environment`

### Task 4: Regression + docs
- **Change:** Full `dotnet build` + `dotnet test`; update README with the new security config.
- **Test:** Build 0 warnings, all tests green.
- **Commit:** `docs: document Milestone 4 security configuration`
