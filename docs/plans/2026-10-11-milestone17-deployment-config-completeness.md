# Milestone 17 — Model-catalog configurability & deployment-config completeness

## Goal

Close the remaining deployment-configuration gaps so the model catalog (and every other
runtime knob) can actually be configured in Docker, and add a frontend readiness
healthcheck. STATELESS — no DB, no EF Core, no persistence.

## Findings that motivate this milestone

- `ModelCatalogService` reads `Models:Agent` / `Models:Direct`, and `README.md` says
  "values come from the `Models` config section", but **docker-compose does not forward
  them, `.env.example` does not document them, and neither env table lists them** — so in
  Docker the catalog is effectively hard-coded. This is the same class of drift that
  `DeploymentConfigTests` exists to catch, but the guard never learned about `Models`.
- Binding a *list* from environment variables requires indexed keys
  (`Models__Agent__0__Id=...`), which is painful in a `.env` file. A single-JSON-value
  override (`Models__Agent=[{"Id":"hermes","Label":"Hermes (Default)"}]`) makes it ergonomic.
- `docker-compose.yml` gives the `backend` a healthcheck but the `frontend` service has
  none, so `docker compose ps` cannot report whether the preview server is actually serving.

## Design decisions

1. `ModelCatalogService` exposes `public const string AgentSection = "Models:Agent";` and
   `DirectSection = "Models:Direct";` so regression guards can derive the env-var names
   from code (same pattern as `JwtOptions.SectionName` / `ReverseProxyOptions.SectionName`).
2. Resolution order per section: **indexed child keys win** (`GetSection(...).Get<List<ModelInfo>>()`),
   then a **single JSON value** (`_configuration[section]`, e.g. `Models__Agent`), then the
   built-in defaults. An empty/whitespace value falls through to defaults (keeps the existing
   `GetCatalog_FallsBackToDefaults_ForEmptyConfiguredSection` test green).
3. Malformed JSON must **never throw** — log a warning and fall back to defaults.
4. An optional `ILogger<ModelCatalogService>?` constructor parameter (defaults to
   `NullLogger`) keeps the existing `new ModelCatalogService(config)` test call sites compiling.
5. Frontend healthcheck uses `node -e "fetch(...)"` (Node 22 ships a global `fetch`), not
   `curl`/`wget`, so it depends on nothing that may be absent from `node:22-alpine`.
6. `appsettings.json` declares the `Models` section with the current defaults so the catalog
   is discoverable/overridable from a config file as well as from the environment.

## Tasks (TDD: red → green → commit)

### Task 1 — ModelCatalogService: section constants + JSON override
- Files: `src/OmniChat.Api/Infrastructure/Services/ModelCatalogService.cs`,
  `tests/OmniChat.Tests/Services/ModelCatalogServiceTests.cs`
- Steps:
  1. RED: add tests — (a) JSON value in `Models:Agent` binds a catalog;
     (b) malformed JSON falls back to defaults without throwing;
     (c) indexed keys take precedence over a JSON value; (d) `SectionName`s are public consts.
  2. Run `dotnet test` → confirm the new tests fail to compile / fail.
  3. GREEN: make the two section constants public; add JSON parsing with a
     case-insensitive `JsonSerializerOptions`; add the optional logger; catch
     `JsonException` and log a warning, returning defaults.
  4. Run `dotnet test` → all green.
  5. Commit.

### Task 2 — docker-compose + .env.example forward the catalog
- Files: `docker-compose.yml`, `.env.example`
- Steps: add `Models__Agent=${Models__Agent:-}` and `Models__Direct=${Models__Direct:-}`
  to the backend `environment:`; document both in `.env.example` with JSON examples.
- Check: `python3 -c "import yaml,sys;yaml.safe_load(open('docker-compose.yml'))"` parses.
- Commit.

### Task 3 — appsettings.json declares the Models section
- File: `src/OmniChat.Api/appsettings.json`
- **Already satisfied on inspection** — the file already declares `Models.Agent[]` / `Models.Direct[]`
  matching the code defaults. No edit needed; recorded here so the finding is not re-investigated.

### Task 4 — frontend readiness healthcheck
- File: `docker-compose.yml`
- Steps: add a `healthcheck` to the `frontend` service using
  `node -e "fetch('http://localhost:4173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
- Commit.

### Task 5 — Documentation
- Files: `README.md` (env table + API note + milestone list), `docs/deployment.md` (env table +
  health-check section).
- Steps: add `Models__Agent` / `Models__Direct` rows; note the JSON form; document the
  frontend healthcheck; add the Milestone 17 line.
- Commit.

### Task 6 — Regression guards
- File: `tests/OmniChat.Tests/Deployment/DeploymentConfigTests.cs`
- Steps: add guards that docker-compose forwards `Models__Agent`/`Models__Direct`, `.env.example`
  documents them, `docs/deployment.md` documents them, `appsettings.json` declares `Models`,
  and the frontend service has a healthcheck. Derive the env prefix from the new public consts.
- Run `dotnet test` → all green.
- Commit.

### Task 7 — Verification & push
- `dotnet build OmniChat.slnx -c Release` (0 warnings), `dotnet test OmniChat.slnx -c Release`,
  `cd frontend && npm run build`.
- `git push`, then `gh run list --limit 3` until CI is green.

## Out of scope
- Any database / EF Core / persistence.
- Behaviour changes to chat streaming.
