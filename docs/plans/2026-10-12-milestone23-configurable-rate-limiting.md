# Milestone 23 — Configurable Rate Limiting

## Goal

Rate limiting is currently hardcoded (10 req/min per IP). Make it configurable
via environment variables so operators can tune limits without code changes.

## Config Keys

| Env var | Config path | Default | Description |
|---|---|---|---|
| `RateLimit__TokenLimit` | `RateLimit:TokenLimit` | `10` | Max tokens (requests) per period per IP |
| `RateLimit__ReplenishmentPeriodSeconds` | `RateLimit:ReplenishmentPeriodSeconds` | `60` | Seconds per replenishment period |

Derived: `TokensPerPeriod = TokenLimit`, `ReplenishmentPeriod = TimeSpan.FromSeconds(ReplenishmentPeriodSeconds)`.

## Tasks

### Task 1: Add RateLimitOptions
- Create `src/OmniChat.Api/Infrastructure/Networking/RateLimitOptions.cs`
- Properties: `TokenLimit` (int, default 10), `ReplenishmentPeriodSeconds` (int, default 60)
- `const string SectionName = "RateLimit"`

### Task 2: Wire into Program.cs
- Read `RateLimit` section into `RateLimitOptions`
- Use values in both `AddTokenBucketLimiter` and the per-ip policy
- Fallback to defaults when not configured

### Task 3: Add .env.example + docker-compose + appsettings
- `.env.example`: `RateLimit__TokenLimit=`, `RateLimit__ReplenishmentPeriodSeconds=`
- `docker-compose.yml`: pass-through env vars with defaults
- `appsettings.json`: add `RateLimit` section with defaults
- `README.md`: add rows to Environment Variables table

### Task 4: Tests
- Unit test: `RateLimitOptions` binds correctly from config
- Integration test: custom rate limit (2 req/period) returns 429 on 3rd request
- Deployment config test: `.env.example` and docker-compose contain the new vars

### Task 5: Update CHANGELOG + README features list
- Add Milestone 23 entry to CHANGELOG
- Add feature bullet to README

## Constraints
- STATELESS — no database, no distributed rate limiting (Redis, etc.)
- Backward compatible: existing deployments without the new env vars use defaults (10 req/min)
