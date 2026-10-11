# Milestone 11: Production Startup Validation & Request Safety

## Goal
Add production safety nets: startup config validation (warn on insecure settings),
request body size limit (DoS prevention), and documentation/env polish.

## Constraints
- STATELESS — no database, EF Core, or persistence of any kind.
- DRY, YAGNI, TDD — write failing test first, then minimal implementation.

## Tasks

### Task 1: Startup Configuration Validation Service
- **File:** `src/OmniChat.Api/Infrastructure/Services/StartupConfigValidator.cs`
- **Interface:** `IHostedService` — runs once on startup
- **Behavior:** In Production, logs warnings when:
  - `Security:ApiKey` is empty → "API is open (no API key configured)"
  - `Cors:AllowedOrigins` is empty → "CORS allows any origin"
  - `Security:Jwt:SigningKey` is empty → "JWT auth disabled"
- **Registration:** `Program.cs` — `builder.Services.AddHostedService<StartupConfigValidator>()`
- **Test:** `StartupConfigValidatorTests.cs` — verify warnings logged for each insecure setting

### Task 2: Request Body Size Limit
- **File:** `Program.cs` — configure Kestrel `MaxRequestBodySize`
- **Config:** `Kestrel:MaxRequestBodySizeBytes` in appsettings.json (default: 10485760 = 10MB)
- **Behavior:** Kestrel rejects requests exceeding the limit with 413
- **Test:** Integration test — POST with oversized body returns 413

### Task 3: README & .env.example Polish
- Fix `## ## Architecture` → `## Architecture` typo in README
- Add `Security__Jwt__Issuer` and `Security__Jwt__Audience` to `.env.example`
- Add `Kestrel__MaxRequestBodySizeBytes` to `.env.example` and deployment.md env table
- Update README milestones section with M11

### Task 4: Deployment Config Tests
- Add assertions to `DeploymentConfigTests.cs`:
  - `.env.example` contains `Security__Jwt__Issuer` and `Security__Jwt__Audience`
  - docker-compose forwards `Kestrel__MaxRequestBodySizeBytes` (if added)

### Task 5: Verify, Commit, Push, Check CI
- `dotnet build OmniChat.slnx -c Release` (0 warnings)
- `dotnet test OmniChat.slnx -c Release` (all pass)
- `npm run build` (frontend)
- `git add`, `git commit`, `git push`
- `gh run list` — CI green

## Risks
- IHostedService runs after WebHost build — need to inject IConfiguration + ILogger
- Kestrel MaxRequestBodySize can be set via ConfigureKestrel or per-endpoint metadata
- Request size limit must NOT block SSE streaming responses (it limits request body, not response)
