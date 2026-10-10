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
