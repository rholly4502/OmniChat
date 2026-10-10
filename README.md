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
│   ├── Infrastructure/        → ChatService, Middleware
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

### `GET /health` — Health Check

Returns `200 OK` when the service is running.

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

## Milestones

- **Milestone 1** ✅ — Core SSE streaming, Clean Architecture, Hermes Bridge + Direct LLM
- **Milestone 2** ✅ — Quality, testing, resilience, frontend polish (11 tests, 0 warnings)
- **Milestone 3** ✅ — Docker, env config, rate limiting, integration tests, deployment guide
