# OmniChat — Deployment Guide

## Prerequisites

- Docker 24.0+ and Docker Compose v2
- (Optional) LLM API key (OpenRouter)
- (Optional) Hermes Agent running on `localhost:5000`

## Environment Variables

Copy `.env.example` to `.env` and fill in real values — never commit `.env` or any secret:

```bash
cp .env.example .env
# edit .env, then:
docker compose up -d --build
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ASPNETCORE_ENVIRONMENT` | `Production` | .NET environment |
| `ASPNETCORE_URLS` | `http://+:5184` | Backend listen URL |
| `Hermes__Endpoint` | `http://host.docker.internal:5000/v1/chat/completions` | Hermes Gateway URL (host, reachable via `host.docker.internal`) |
| `LLM__Endpoint` | `https://openrouter.ai/api/v1/chat/completions` | Direct LLM provider URL (forwarded by docker-compose) |
| `LLM_API_KEY` | (empty) | OpenRouter API key — maps to `LLM__ApiKey` (Direct mode only) |
| `Security__ApiKey` | (empty) | Backend API key clients send as `X-Api-Key` |
| `Cors__AllowedOrigins` | (empty) | Comma-separated browser origins allowed to call the API |
| `Security__Jwt__SigningKey` | (empty) | HMAC-SHA256 secret for `Authorization: Bearer <token>` validation |
| `Security__Jwt__Issuer` | `OmniChat` | JWT issuer claim (`Security:Jwt:Issuer`) |
| `Security__Jwt__Audience` | `OmniChat` | JWT audience claim (`Security:Jwt:Audience`) |
| `Kestrel__MaxRequestBodySizeBytes` | `10485760` (10 MB) | Maximum request body size in bytes (DoS prevention) |
| `VITE_API_PROXY_TARGET` | `http://backend:5184` (Docker) | Target the frontend `/api` proxy forwards to |

> **Note:** In .NET, use `__` (double underscore) in environment variables to override nested JSON config keys (e.g. `Security__ApiKey` → `Security:ApiKey`).

> **⚠️ Security warning — do not expose this stack without an API key.**
> If `Security__ApiKey` is empty the backend is **open**: the API-key middleware
> lets every request through. Likewise an empty `Cors__AllowedOrigins` falls back
> to `AllowAnyOrigin`, so any website can call the API. For any public or shared
> deployment set **both** a long random `Security__ApiKey` and an explicit
> `Cors__AllowedOrigins` list, and terminate TLS at a reverse proxy.

## Container Image Notes

- **Health check needs `curl`.** The `mcr.microsoft.com/dotnet/aspnet` runtime image does **not** bundle
  `curl` (or `wget`). The backend `Dockerfile` therefore installs `curl` in the runtime stage so the
  `docker-compose.yml` healthcheck (`curl -f http://localhost:5184/health`) — and the image's own
  `HEALTHCHECK` — pass. Without it the backend stays `unhealthy` and the frontend, which waits on
  `depends_on: backend: condition: service_healthy`, never starts.
- **`.dockerignore`.** A root `.dockerignore` keeps `.env` (secrets), `node_modules/`, `bin/`, `obj/` and
  `.git/` out of the build context, so credentials never reach an image layer and image builds stay lean.
- **Reproducible frontend image.** The frontend runtime stage installs `vite` via `npm ci` from
  `package-lock.json` (pinned) instead of a floating `npm install`.

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

Both `npm run dev` **and** `vite preview` proxy `/api/*` to the backend (see
`preview.proxy` in `frontend/vite.config.ts`) — the frontend Docker image serves
with `vite preview`, so the proxy must exist there too. The target defaults to
`http://localhost:5184` and is overridden in Docker via `VITE_API_PROXY_TARGET`
(`http://backend:5184`).

Optionally front the stack with a reverse proxy (nginx, Caddy) instead:
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

- Never commit secrets. Put real values in `.env` (git-ignored) — see `.env.example`.
- Set `Security__ApiKey` and `Cors__AllowedOrigins` for any non-local deployment; empty values leave the API open (see the warning above).
- `appsettings.Development.json` contains localhost-only endpoints (no secrets).
- Rate limiting protects against abuse on the chat endpoint.
- **Startup configuration validation:** in Production the backend logs warnings at startup when `Security:ApiKey`, `Cors:AllowedOrigins`, or `Security:Jwt:SigningKey` is empty. Check the logs after `docker compose up` to catch misconfigurations before they become security incidents.
- **Request body size limit:** Kestrel rejects requests exceeding `Kestrel:MaxRequestBodySizeBytes` (default 10 MB) with HTTP 413, preventing DoS via oversized payloads.
- HTTPS redirection (`UseHttpsRedirection`) runs **only outside Production**. In Docker the app serves plain HTTP behind a TLS-terminating reverse proxy; the redirect is disabled in Production to avoid loops/broken requests.
