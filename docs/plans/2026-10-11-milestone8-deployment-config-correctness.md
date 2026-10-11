# Milestone 8 — Deployment configuration correctness & documentation sync

**Goal:** make the documented environment variables actually work end-to-end, and
add a regression guard so env-var↔config-section drift cannot silently return.
Stateless project — no DB, no EF Core, no persistence.

## Problem (verified)

`JwtOptions.SectionName = "Security:Jwt"`, so the .NET config key is
`Security:Jwt:SigningKey` and the env var must be `Security__Jwt__SigningKey`.
But `docker-compose.yml`, `.env.example` and `docs/deployment.md` all use
`Jwt__SigningKey`, which binds to `Jwt:SigningKey` — a section nothing reads.
Consequence: JWT auth can never be enabled in Docker via the documented variable.
(`.env.example` is self-inconsistent: its comment says `Security:Jwt:SigningKey`.)
Also `LLM__Endpoint` is documented in `docs/deployment.md` but not forwarded by
`docker-compose.yml`.

## Tasks

### Task 1 — Regression guard test (RED first)
- New `tests/OmniChat.Tests/Deployment/DeploymentConfigTests.cs`.
- Derive the expected env var from `JwtOptions.SectionName` (`:`→`__`) so the test
  mirrors the code, not a hard-coded literal.
- Assert: `docker-compose.yml` forwards `Security__Jwt__SigningKey` and no longer
  contains a stale bare `Jwt__SigningKey`; `.env.example` and `docs/deployment.md`
  use `Security__Jwt__SigningKey`; `docker-compose.yml` forwards `LLM__Endpoint`.
- **Check:** `dotnet test` fails on the stale name.

### Task 2 — Fix the deployment files (GREEN)
- `docker-compose.yml`: `Jwt__SigningKey` → `Security__Jwt__SigningKey`; add
  `LLM__Endpoint=${LLM__Endpoint:-https://openrouter.ai/api/v1/chat/completions}`.
- `.env.example`: rename the variable; keep the section comment.
- `docs/deployment.md`: rename the table row; document `LLM__Endpoint` as forwarded.
- **Check:** the new tests pass.

### Task 3 — Documentation sync
- README: add Milestone 7 & 8 rows; correct the milestone test counts (72).

### Task 4 — Verify & ship
- `dotnet build OmniChat.slnx -c Release`, `dotnet test OmniChat.slnx -c Release`,
  `npm run build` in `frontend/`; commit + push; confirm CI green (`gh run list`).
