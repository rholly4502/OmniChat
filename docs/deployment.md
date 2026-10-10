# OmniChat — Deployment Guide

## Prerequisites

- Docker 24.0+ and Docker Compose v2
- (Optional) LLM API key (OpenRouter)
- (Optional) Hermes Agent running on `localhost:5000`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASPNETCORE_ENVIRONMENT` | `Production` | .NET environment |
| `ASPNETCORE_URLS` | `http://+:5184` | Backend listen URL |
| `Hermes__Endpoint` | `http://localhost:5000/v1/chat/completions` | Hermes Gateway URL |
| `LLM__Endpoint` | `https://openrouter.ai/api/v1/chat/completions` | Direct LLM provider URL |
| `LLM__ApiKey` | (empty) | OpenRouter API key (Direct mode only) |

> **Note:** In .NET, use `__` (double underscore) in environment variables to override nested JSON config keys.

## Docker Deployment

### Quick Start

```bash
# Build and run both services
docker compose up -d --build

# Check health
curl http://localhost:5184/health

# View logs
docker compose logs -f backend
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `backend` | 5184 | .NET 10 API (SSE streaming) |
| `frontend` | 4173 | React/Vite preview server |

### Frontend API Proxy

The frontend dev server proxies `/api/*` to the backend. In production (Docker), configure your reverse proxy (nginx, Caddy) to route:
- `/api/*` → `backend:5184`
- `/*` → `frontend:4173`

## Reverse Proxy (Nginx Example)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://frontend:4173;
        proxy_set_header Host $host;
    }

    # Backend API + SSE
    location /api/ {
        proxy_pass http://backend:5184;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE support — disable buffering
        proxy_buffering off;
        proxy_cache off;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 86400s;
    }

    # Health check
    location /health {
        proxy_pass http://backend:5184;
    }
}
```

## Health Checks

- **Backend:** `GET /health` → `200 OK`
- **Docker:** Healthcheck configured in docker-compose (30s interval, 3 retries)

## Rate Limiting

The API enforces a **token bucket** rate limit of 10 requests/minute per client IP on the `/api/chat/stream` endpoint. Exceeding the limit returns `429 Too Many Requests`.

## Local Development

```bash
# Backend
cd src/OmniChat.Api
dotnet run --environment Development

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Testing

```bash
# Unit + Integration tests
dotnet test OmniChat.slnx -c Release

# Frontend build check
cd frontend && npm run build
```

## Security Notes

- Never commit API keys to `appsettings.json`. Use environment variables or user-secrets.
- `appsettings.Development.json` contains localhost-only endpoints (no secrets).
- Rate limiting protects against abuse on the chat endpoint.
- HTTPS redirection is enabled in production (`UseHttpsRedirection`).
