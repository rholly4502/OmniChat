# Milestone 13 — Frontend API Key Authentication + JSON Production Logging

**Date:** 2026-10-11
**Stateless:** No database, no persistence layer added.

## Problem

The backend protects `/api/models` and `/api/chat/stream` with `ApiKeyMiddleware`
when `Security:ApiKey` is configured. The frontend (`App.tsx`) sends **no auth
headers**, so it cannot call either endpoint on a secured backend — the UI is
dead on arrival in any production deployment with auth enabled.

Secondary gaps:
- Production logs use the default text formatter (hard to parse in log aggregators).
- No integration test verifies that `/api/models` is actually protected by the API key.

## Tasks

### Task 1 — Backend: integration tests for `/api/models` auth (TDD characterization)

**File:** `tests/OmniChat.Tests/Integration/ModelsEndpointIntegrationTests.cs`

Add two tests using `WithWebHostBuilder` to inject `Security:ApiKey`:

1. `GetModels_WithoutApiKey_Returns401` — when key configured, no header → 401
2. `GetModels_WithCorrectApiKey_Returns200` — when key configured, correct header → 200

**Check:** `dotnet test` — should pass (middleware already protects `/api/models`).

### Task 2 — Backend: JSON structured logging in production

**File:** `src/OmniChat.Api/appsettings.Production.json`

Add `Console` formatter options:
```json
"Console": {
  "FormatterName": "json",
  "FormatterOptions": {
    "IncludeScopes": true,
    "TimestampFormat": "yyyy-MM-ddTHH:mm:ss.fffZ"
  }
}
```

Makes logs machine-readable for ELK/Grafana Loki without adding packages.

### Task 3 — Frontend: API key input + localStorage + X-Api-Key header

**File:** `frontend/src/App.tsx`

1. Add `apiKey` state initialised from `localStorage.getItem('omnichat_api_key')`
2. Persist to localStorage on change via `useEffect`
3. Add password input in sidebar (between Model selector and Clear chat)
4. Include `X-Api-Key` header in both fetch calls when `apiKey` is non-empty
5. Re-fetch model catalog when `apiKey` changes (add to `useEffect` deps)
6. Improve 401 message: "Autentikasi diperlukan (401). Masukkan API key di sidebar."
7. Add auth status indicator (🔒 / 🔓)

**Check:** `npm run build` — TypeScript + Vite build passes.

### Task 4 — Update README

- Add Milestone 13 entry
- Document frontend auth support in the Authentication section
- Update test count

### Task 5 — Verify and ship

- `dotnet build OmniChat.slnx -c Release`
- `dotnet test OmniChat.slnx -c Release`
- `cd frontend && npm run build`
- Commit + push
- `gh run list` — CI green
