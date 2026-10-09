# OmniChat — Hybrid AI Dashboard (.NET 10 + React)

Web UI dengan 2 mode:
- **⚡ Direct Mode** — prompt langsung ke LLM via OpenRouter (streaming SSE, cepat)
- **🤖 Agent Mode** — prompt ke Hermes Agent Gateway (`localhost:5000`, punya tools + memory + skills)

## Struktur
```
src/OmniChat.Api/   → Backend .NET 10 (Clean Architecture Lite, SSE streaming)
frontend/           → React + TypeScript + Vite + Tailwind CSS v4
docs/               → Technical Design Document
```

## Menjalankan

### Backend (.NET 10)
```bash
cd src/OmniChat.Api
dotnet run --port 5184
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

## API
`POST /api/chat/stream` — SSE endpoint. Body: `{ model, useHermesBridge, messages[] }`
