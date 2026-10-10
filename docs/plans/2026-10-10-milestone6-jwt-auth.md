# Implementation Plan: Milestone 6 — JWT Bearer Authentication

**Date:** 2026-10-10
**Feature:** dual authentication (API key OR JWT bearer token)

## Context
Milestones 1–5 are complete and verified (build green 0 warnings, 46/46 tests passing).
The only authentication mechanism today is a static `X-Api-Key` header (`ApiKeyMiddleware`).
That is fine for a single trusted client but does not scale: every caller shares one secret and
there is no identity, expiry, or per-user claim. Milestone 6 adds **JWT bearer authentication**
as a first-class alternative, keeping the API key working for backwards compatibility.

Design constraint: **purely additive**. The API-key path and all 46 existing tests must keep
passing. JWT is inert (pass-through) until `Security:Jwt:SigningKey` is configured, exactly like
the API key is inert until `Security:ApiKey` is set.

## Auth resolution rule (documented behaviour)
1. Exempt paths (`/health`, `/openapi`) always pass.
2. A valid `Authorization: Bearer <jwt>` passes and marks the request authenticated.
3. An **invalid** bearer token (present but fails validation) returns `401` — no silent fallback.
4. No bearer token: if an API key is configured, defer to `ApiKeyMiddleware`; otherwise `401`.

## Tasks

### Task 1: Options + token validator
- **Files:** `src/OmniChat.Api/Infrastructure/Auth/JwtOptions.cs`,
  `src/OmniChat.Api/Infrastructure/Auth/JwtTokenValidator.cs`,
  `tests/OmniChat.Tests/Auth/JwtTokenValidatorTests.cs`
- **Change:** `JwtOptions` binds `Security:Jwt` (`SigningKey`, `Issuer`, `Audience`). `JwtTokenValidator`
  wraps `JwtSecurityTokenHandler` with HmacSha256, validating issuer, audience, lifetime and key.
  `IsEnabled` is true only when `SigningKey` is non-empty. `TryValidate(token, out principal)`.
- **Test (red→green):** valid token → true + subject claim; expired → false; wrong signing key → false;
  wrong issuer → false; malformed string → false; disabled validator → false.

### Task 2: JWT authentication middleware
- **Files:** `src/OmniChat.Api/Infrastructure/Middleware/JwtAuthenticationMiddleware.cs`,
  `tests/OmniChat.Tests/Middleware/JwtAuthenticationMiddlewareTests.cs`
- **Change:** Reads `Authorization` header. Implements the resolution rule above. On success stores a
  marker in `HttpContext.Items` (`JwtAuthenticationMiddleware.AuthenticatedItemKey`) that
  `ApiKeyMiddleware` honours.
- **Test:** disabled → pass-through; exempt path → pass-through; valid bearer → next + item set;
  invalid bearer → 401; no bearer & no API key → 401; no bearer & API key configured → next.

### Task 3: Wire into the API-key middleware + pipeline + config
- **Files:** `src/OmniChat.Api/Infrastructure/Middleware/ApiKeyMiddleware.cs`, `Program.cs`,
  `src/OmniChat.Api/appsettings.json`, `appsettings.Development.json`, `OmniChat.Api.csproj`
- **Change:** `ApiKeyMiddleware` short-circuits to `next` when the JWT item is set. Register the
  validator as a singleton and insert `JwtAuthenticationMiddleware` after `RequestLoggingMiddleware`
  and before `ApiKeyMiddleware`. Add the JwtBearer package + `Security:Jwt` config section.
- **Test:** all existing middleware tests remain green (pass-through semantics unchanged).

### Task 4: Integration coverage
- **Files:** `tests/OmniChat.Tests/Integration/JwtAuthIntegrationTests.cs`
- **Change:** End-to-end through `WebApplicationFactory<Program>` with JWT configured via
  `WithWebHostBuilder`. No credential → 401; valid bearer → 200; tampered bearer → 401; `/health` exempt.
- **Test:** as above.

### Task 5: Regression + docs + commit
- **Change:** Full `dotnet build` + `dotnet test`; README feature list, milestone table, config docs.
- **Test:** Build 0 warnings, all tests green.
- **Commit:** `feat: add JWT bearer authentication alongside API key (Milestone 6)`
