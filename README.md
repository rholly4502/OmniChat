# OmniChat — Hybrid AI Dashboard (.NET 10 + React)

Web UI dengan 2 mode:
- **⚡ Direct Mode** — prompt langsung ke LLM via OpenRouter (streaming SSE, cepat)
- **🤖 Agent Mode** — prompt ke Hermes Agent Gateway (`localhost:5000`, punya tools + memory + skills)

## Fitur

- ✅ SSE streaming (Server-Sent Events) dengan auto-scroll dan stop button
- ✅ Clean Architecture (Domain / Application / Infrastructure / Controllers)
- ✅ Dual-mode toggle: Hermes Bridge vs Direct LLM
- ✅ Markdown rendering dengan GFM support
- ✅ Model selector dropdown
- ✅ Health check endpoint (`/health`)
- ✅ Global exception handling middleware
- ✅ Rate limiting (10 req/min per IP)
- ✅ Docker containerization (multi-stage build)
- ✅ Integration tests (WebApplicationFactory)
- ✅ OpenAPI documentation
- ✅ API-key authentication middleware (constant-time compare, exempt `/health`)
- ✅ Correlation ID middleware (`X-Correlation-Id` header + logging scope)
- ✅ Configurable CORS policy per environment
- ✅ CI/CD pipeline (GitHub Actions — backend + frontend)
- ✅ Structured access logging (method, path, status, duration, correlation id)
- ✅ Enriched health check (`/health` → JSON: status, version, uptime)
- ✅ JWT bearer authentication (HMAC-SHA256, validates signature/issuer/audience/lifetime) alongside the API key
- ✅ Dynamic model catalog (`GET /api/models`) — backend-configured, consumed by the UI
- ✅ `.dockerignore` + curl-equipped runtime image (working healthcheck; no secrets/artifacts in the build context)
- ✅ Security response headers middleware (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies`) + `Server` header suppression
- ✅ Startup configuration validation (warns on empty API key / CORS / JWT signing key in production)
- ✅ Request body size limit (Kestrel `MaxRequestBodySize`, configurable, default 10 MB)

## Prerequisites

- .NET SDK 10.0+ ([download](https://dotnet.microsoft.com/download))
- Node.js 22+ and npm
- (Optional) Docker 24.0+
- (Optional) OpenRouter API key
- (Optional) Hermes Agent running on `localhost:5000`

## Struktur Project

```
OmniChat/
├── src/OmniChat.Api/          → Backend .NET 10 (Clean Architecture)
│   ├── Controllers/           → ChatController (SSE endpoint)
│   ├── Domain/Models/         → ChatRequest, ChatMessage
│   ├── Application/Interfaces/→ IChatService
│   ├── Infrastructure/        → ChatService, Middleware, Auth (JwtTokenValidator)
│   ├── Program.cs             → App entry point + DI + rate limiting
│   └── appsettings*.json      → Environment-based config
├── frontend/                  → React + TypeScript + Vite + Tailwind v4
├── tests/OmniChat.Tests/      → xUnit + Moq + WebApplicationFactory
│   ├── Controllers/           → Unit tests
│   ├── Services/              → Unit tests (SSE parsing, fallback)
│   └── Integration/           → Integration tests (full HTTP pipeline)
├── docs/                      → Plans + Deployment guide
├── Dockerfile                 → Multi-stage backend build
├── docker-compose.yml         → Backend + Frontend orchestration
└── OmniChat.slnx             → .NET 10 XML solution file
```

## Menjalankan

### Backend (.NET 10)

```bash
cd src/OmniChat.Api
dotnet run --environment Development
```

API key OpenRouter isi di `appsettings.json` → `LLM:ApiKey` (jangan commit key!).
Tanpa key, backend tetap jalan dengan **fallback simulation mode**.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173 — request `/api/*` otomatis di-proxy ke backend port 5184.

### Docker

```bash
docker compose up -d --build
# Backend: http://localhost:5184
# Frontend: http://localhost:4173
```

Lihat [docs/deployment.md](docs/deployment.md) untuk panduan lengkap deployment.

## Testing

```bash
# All tests (unit + integration)
dotnet test OmniChat.slnx -c Release

# Frontend build check
cd frontend && npm run build
```

## API

### `GET /api/models` — Model Catalog

Returns the selectable models grouped by chat mode (values come from the `Models` config section).

```json
{
  "agent":  [ { "id": "hermes", "label": "Hermes (Default)" } ],
  "direct": [ { "id": "nvidia/nemotron-3.5-lightning:free", "label": "Nemotron 3.5 (Free)" } ]
}
```


### `POST /api/chat/stream` — SSE Endpoint

**Body:**
```json
{
  "model": "default",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "useHermesBridge": true
}
```

**Response:** `text/event-stream`
```
data: {"content":"Hello"}
data: {"content":"!"}
data: [DONE]
```

### Authentication

Protected endpoints accept **either** scheme (both are inert until configured):

- `X-Api-Key: <key>` — set via `Security:ApiKey` (constant-time compare).
- `Authorization: Bearer <jwt>` — enabled when `Security:Jwt:SigningKey` is set.

Rules: exempt paths (`/health`, `/openapi`) always pass; a present-but-invalid bearer token returns
`401` (no fallback); with no bearer token the request falls back to the API key when one is configured.

```json
"Security": {
  "ApiKey": "",
  "Jwt": { "SigningKey": "", "Issuer": "OmniChat", "Audience": "OmniChat" }
}
```

### `GET /health` — Health Check

Returns `200 OK` with a JSON body when the service is running:
```json
{
  "status": "Healthy",
  "version": "1.0.0.0",
  "uptimeSeconds": 42,
  "checks": []
}
```

## Environment Variables

| Variable | Config Section | Required | Description |
|---|---|---|---|
| `Hermes__Endpoint` | `Hermes:Endpoint` | No (default: localhost) | Hermes Agent gateway chat-completions URL. In Docker: `http://host.docker.internal:5000/v1/chat/completions` |
| `LLM__Endpoint` | `LLM:Endpoint` | No (default: OpenRouter) | Direct-mode LLM provider chat-completions URL |
| `LLM_API_KEY` | `LLM:ApiKey` | No | OpenRouter API key for Direct mode. Leave empty for Hermes-only use |
| `Security__ApiKey` | `Security:ApiKey` | **Yes (prod)** | API key sent via `X-Api-Key` header. **Empty = open access** |
| `Security__Jwt__SigningKey` | `Security:Jwt:SigningKey` | No | HMAC-SHA256 key for JWT validation. Empty = JWT auth disabled |
| `Security__Jwt__Issuer` | `Security:Jwt:Issuer` | No (default: `OmniChat`) | JWT issuer claim |
| `Security__Jwt__Audience` | `Security:Jwt:Audience` | No (default: `OmniChat`) | JWT audience claim |
| `Kestrel__MaxRequestBodySizeBytes` | `Kestrel:MaxRequestBodySizeBytes` | No (default: 10 MB) | Max request body size in bytes (DoS prevention) |
| `Cors__AllowedOrigins` | `Cors:AllowedOrigins` | **Yes (prod)** | Comma-separated allowed origins. **Empty = allow any origin** |
| `VITE_API_PROXY_TARGET` | — | No (Docker override) | Frontend `/api` proxy target. Docker sets `http://backend:5184` |

> **⚠️ Security:** `Security__ApiKey` and `Cors__AllowedOrigins` **must** be set in any non-local deployment. Empty values mean the API is open and accepts requests from any origin.

## Architecture

**Clean Architecture Lite:**
- **Domain** — `ChatRequest`, `ChatMessage` (models + validation)
- **Application** — `IChatService` (interface, no dependencies on infrastructure)
- **Infrastructure** — `ChatService` (Channel<T> producer pattern for SSE streaming, HttpClient for LLM calls)
- **Controllers** — `ChatController` (SSE response writer, rate limiting, OpenAPI metadata)

**Key decisions:**
- `ChatService` uses `Channel<T>` producer pattern (yield cannot be in try/catch in C#)
- `Microsoft.OpenApi` pinned to 2.12.0 (fixes GHSA-v5pm-xwqc-g5wc)
- Solution uses `.slnx` format (.NET 10 XML-based solution)
- Rate limiting: token bucket, 10 req/min per IP (returns 429 on excess)
- Authentication: dual scheme — `ApiKeyMiddleware` + `JwtAuthenticationMiddleware` (JWT validated by `JwtTokenValidator`, claim names kept verbatim via `MapInboundClaims=false`)

## Milestones

- **Milestone 1** ✅ — Core SSE streaming, Clean Architecture, Hermes Bridge + Direct LLM
- **Milestone 2** ✅ — Quality, testing, resilience, frontend polish (33 tests, 0 warnings)
- **Milestone 3** ✅ — Docker, env config, rate limiting, integration tests, deployment guide, API-key auth, CORS, correlation ID, CI/CD
- **Milestone 4** ✅ — Security & observability hardening (API-key auth, correlation-id, configurable CORS)
- **Milestone 5** ✅ — Observability & production readiness (request logging, enriched JSON health check, rate-limit integration coverage) — 46 tests, 0 warnings
- **Milestone 6** ✅ — JWT bearer authentication (dual-auth with API key, HMAC-SHA256 validation, unit + integration coverage) — 67 tests, 0 warnings
- **Milestone 7** ✅ — Dynamic model catalog (`GET /api/models`), backend-configured, consumed by the UI — 72 tests, 0 warnings
- **Milestone 8** ✅ — Deployment config correctness (env-var ↔ config-section names verified, `Security__Jwt__SigningKey` fix, `LLM__Endpoint` forwarded, deployment-config regression guard) — 76 tests, 0 warnings
- **Milestone 9** ✅ — Container & deployment hardening: runtime image now installs `curl` so the docker-compose healthcheck actually passes (previously `curl` was missing → backend permanently `unhealthy` → frontend never started); added root `.dockerignore` (excludes `.env`/`node_modules`/`bin`/`obj` from the build context); reproducible frontend runtime image (`npm ci` from the lockfile); `Dockerfile` `HEALTHCHECK` for plain `docker run` — 80 tests, 0 warnings
- **Milestone 10** ✅ — Security headers & production hardening: `SecurityHeadersMiddleware` adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies: none` to every response; Kestrel `Server` header suppressed (`AddServerHeader = false`); README env-var reference table added — 90 tests, 0 warnings
- **Milestone 11** ✅ — Production startup validation & request safety: `StartupConfigValidator` logs warnings for empty `Security:ApiKey`, `Cors:AllowedOrigins`, and `Security:Jwt:SigningKey` in Production; Kestrel `MaxRequestBodySize` configurable (default 10 MB, DoS prevention); JWT issuer/audience env vars documented and forwarded by docker-compose; README typo fixed — 105 tests, 0 warnings
