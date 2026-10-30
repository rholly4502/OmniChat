# Changelog

All notable changes to OmniChat are documented here.
The project follows [Keep a Changelog](https://keepachangelog.com/) conventions.

## [Unreleased]

### P2 — Pengeluaran trend endpoint (backend slice)

#### Added
- `GET /api/expenses/trend?months=6` returns chronological monthly spend totals
  over the last N months (1–24, default 6), zero-filled for empty months — the
  backend aggregation the pixel trend chart will consume.
- `IExpenseRepository.GetMonthlyTrendAsync` + `ExpenseRepository` implementation
  (grouped by month, ordered oldest → newest, missing months zero-filled).

### Milestone 24 — nginx frontend proxy fix + non-root hardening

#### Fixed
- **Critical**: `frontend/nginx.conf` had no `/api` proxy location — API calls from
  the Docker frontend returned 404 (nginx served `index.html` instead of proxying
  to the backend). Added `location /api/` with `proxy_pass http://backend:5184`,
  SSE support (`proxy_buffering off`, `proxy_read_timeout 86400s`), and standard
  forwarded headers.
- **Frontend Dockerfile** now runs nginx as non-root (`USER nginx`): pre-creates
  and chowns cache/temp dirs, redirects PID path to `/tmp`, removes the `user`
  directive — no CAP_CHOWN needed.
- Re-enabled `cap_drop: ALL` + `no-new-privileges: true` on the frontend
  docker-compose service (removed in a prior fix that was needed for root nginx
  but is unnecessary with the non-root setup).
- Removed stale `VITE_API_PROXY_TARGET` from docker-compose frontend environment
  (nginx handles `/api` proxying; the env var was for vite preview, no longer used).

#### Changed
- `.env.example`: `VITE_API_PROXY_TARGET` documented as local-dev-only.
- `docs/deployment.md`: updated all references from "vite preview" to nginx;
  added `RateLimit__*` env vars to the table; updated non-root execution and
  healthcheck descriptions.
- `README.md`: Docker section now notes nginx serves static files + proxies `/api`.
- Added Milestone 24 to the milestones list.

#### Tests
- 7 new deployment config tests: nginx `/api` proxy, SSE proxy support, listen port,
  SPA fallback, non-root cache dirs, PID path fix, `VITE_API_PROXY_TARGET` removal.
- Updated 3 existing tests to match the nginx-based frontend (USER nginx, chown,
  wget healthcheck).
- 243 backend tests total, 0 warnings.

## [Unreleased]

### Added
- **Milestone 23** — Configurable rate limiting: the per-IP token-bucket rate
  limiter (previously hardcoded to 10 req/min) is now configurable via two
  environment variables: `RateLimit__TokenLimit` (default: 10) and
  `RateLimit__ReplenishmentPeriodSeconds` (default: 60). Added `RateLimitOptions`
  class in `Infrastructure/Networking/`; wired into `Program.cs` so both the
  `chatPolicy` token-bucket limiter and the per-IP partition read the configured
  values. `.env.example`, `docker-compose.yml`, `appsettings.json`, and the
  README environment-variables table document the new settings. Backward
  compatible: existing deployments without the new env vars use the same
  10 req/min defaults. 9 new tests (4 unit, 1 integration with custom config,
  4 deployment-config guards). 236 backend tests + 23 frontend tests, 0 warnings.
- **Milestone 22** — Frontend component testing: added Vitest + @testing-library/react
  + @testing-library/jest-dom + jsdom to the frontend devDependencies; 23 component
  tests covering rendering (title, subtitle, mode toggle, model selector, API key
  input), model catalog fetching (on mount, with X-Api-Key header, fallback to
  built-in defaults on fetch failure/rejection, custom models from response),
  mode toggle (switches between Agent/Direct, updates model selector), API key
  persistence (localStorage set/remove, lock/unlock emoji indicator), send/stop
  button interactions (disabled when empty, enabled on input, clears after send,
  shows user message, shows stop button while streaming), and clear chat.
  `vite.config.ts` gains `test` config (jsdom environment, globals, setupFiles);
  `tsconfig.app.json` excludes test files from production build typecheck;
  `tsconfig.test.json` provides IDE type support (not referenced by `tsc -b`);
  CI workflow runs `npm run test` between lint and build. 223 backend tests +
  23 frontend tests, 0 warnings, frontend builds, CI green.
- **Milestone 21** — README documentation consolidation: merged the two
  overlapping API sections ("## API Reference" + "## API" + "## Error Responses")
  into a single structured section; fixed the health-check response example to
  match the actual `HealthResponseWriter` output (`uptimeSeconds` integer, not
  `uptime` string); added M20 to the README milestones list; standardised curl
  placeholder text. 4 new deployment-config guard tests (single API section,
  health example format, milestones list includes M20, OpenAPI subsection
  preserved). 223 tests, 0 warnings.
- **Milestone 20** — Non-root container hardening + API reference:
  - Backend Dockerfile runs as `app` (UID 101, built into aspnet:10.0); frontend
    runs as `node` (UID 1000, built into node:22-alpine). Both use `--chown` on
    COPY so files are readable after the USER switch.
  - `docker-compose.yml`: `security_opt: ["no-new-privileges:true"]` +
    `cap_drop: ["ALL"]` on both services — prevents privilege escalation and drops
    all Linux capabilities.
  - README gains a structured API Reference section (endpoint table, curl
    examples, request/response schemas, SSE event format, RFC 7807 error table,
    validation constraints) — 219 tests
- **Milestone 19** — OpenAPI document enrichment: `/openapi/v1.json` now carries
  title ("OmniChat API"), description, version, contact, and MIT license metadata
  via `IOpenApiDocumentTransformer`. `StreamChat` declares `401 Unauthorized` in
  its OpenAPI response types. Added `CHANGELOG.md` for portfolio readability.

## [1.0.0] — 2026-10-11

### Milestone 1 — Core SSE Streaming
- Clean Architecture backend (Domain / Application / Infrastructure / Controllers)
- `POST /api/chat/stream` SSE endpoint with `data: {"content":"..."}` events
- Hermes Bridge mode (forwards to Hermes Agent Gateway) + Direct LLM mode (OpenRouter)
- `Channel<T>` producer pattern for async streaming (yield cannot be in try/catch)
- Fallback simulation mode when no LLM key is configured
- React + TypeScript + Vite + Tailwind v4 frontend with markdown rendering (GFM)

### Milestone 2 — Quality & Testing
- xUnit + Moq test suite (33 tests, 0 warnings)
- `TestableHttpMessageHandler` for HttpClient mocking
- Frontend polish: auto-scroll, stop button, streaming indicator, model selector
- `appsettings.Development.json` force-added (localhost endpoints, no secrets)

### Milestone 3 — Production Readiness
- Multi-stage Dockerfile + frontend Dockerfile + docker-compose orchestration
- Environment-based config (`appsettings.Development.json` / `appsettings.Production.json`)
- Rate limiting (token bucket, 10 req/min per IP, returns 429)
- Integration tests via `WebApplicationFactory<Program>`
- OpenAPI metadata, deployment guide, API-key auth middleware
- CORS per-environment, correlation ID middleware
- CI/CD pipeline (GitHub Actions — backend build+test + frontend lint+build)

### Milestone 4 — Security & Observability
- API-key authentication (constant-time compare, exempts `/health`)
- Correlation ID middleware (`X-Correlation-Id` header + logging scope)
- Configurable CORS policy

### Milestone 5 — Observability Hardening
- `RequestLoggingMiddleware` (method, path, status, duration, correlation id)
- Enriched JSON `/health` endpoint (status, version, uptime via `ServiceStartTime`)
- Rate-limit integration test (429 after 10 tokens) — 46 tests

### Milestone 6 — JWT Authentication
- JWT bearer auth (HMAC-SHA256, validates signature/issuer/audience/lifetime)
- Dual-auth with API key (`JwtAuthenticationMiddleware` + `ApiKeyMiddleware`)
- `JwtTokenValidator` with `MapInboundClaims=false` (claim names kept verbatim)
- Inert until `Security:Jwt:SigningKey` is set — 67 tests

### Milestone 7 — Dynamic Model Catalog
- `GET /api/models` returns `{agent:[...], direct:[...]}` from config
- `ModelCatalogService` bound to `Models` config section with built-in defaults
- Frontend fetches `/api/models` at boot with local fallback — 72 tests

### Milestone 8 — Deployment Config Correctness
- `docker-compose.yml`: `Hermes__Endpoint` → `http://host.docker.internal:5000/v1/chat/completions`
- `extra_hosts: ["host.docker.internal:host-gateway"]` on backend
- `frontend/vite.config.ts`: `preview.proxy` (serves via `vite preview` in Docker)
- `Program.cs`: `UseHttpsRedirection()` only outside Production (nginx terminates TLS)
- Blank CORS origins filtered (empty env value falls back safely)
- `.env.example` (tracked) + deployment guide `.env` workflow — 76 tests

### Milestone 9 — Container & Deployment Hardening
- Runtime image installs `curl` (aspnet image doesn't bundle it — dotnet-docker#2379)
- Dockerfile `HEALTHCHECK` + root `.dockerignore` (no secrets/artifacts in build context)
- Frontend runtime uses `npm ci` from `package-lock.json` (pinned, reproducible)
- Deployment-config regression guards — 80 tests

### Milestone 10 — Security Headers
- `SecurityHeadersMiddleware`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies: none`
- Kestrel `Server` header suppressed (`AddServerHeader = false`)
- README env-var reference table — 90 tests

### Milestone 11 — Startup Validation & Request Safety
- `StartupConfigValidator`: warns in Production for empty API key, CORS origins, JWT signing key
- Kestrel `MaxRequestBodySize` configurable (default 10 MB, DoS prevention)
- JWT issuer/audience env vars documented and forwarded — 105 tests

### Milestone 12 — Input Validation & Production Hardening
- `ChatRequest`: model max 100 chars, messages max 50 items
- `ChatMessage`: role whitelist `[user|assistant|system]`, content max 8000 chars
- Graceful shutdown (30s timeout for in-flight SSE streams)
- Docker Compose memory limits (backend 512 MB, frontend 256 MB) — 126 tests

### Milestone 13 — Frontend Auth & JSON Logging
- Sidebar API key input (localStorage, `X-Api-Key` header on every request)
- Auto-refresh model catalog on key change
- `appsettings.Production.json` JSON console formatter (ELK/Loki compatible)
- Integration tests for `/api/models` auth (401 without key, 200 with key) — 128 tests

### Milestone 14 — API Response Quality
- Rate-limit `OnRejected`: `Retry-After` header + ProblemDetails JSON body on 429
- Response compression (Brotli + Gzip for JSON; SSE excluded)
- `Cache-Control: public, max-age=60` on `/api/models`
- Frontend reads `Retry-After` and shows retry countdown — 137 tests

### Milestone 15 — RFC 7807 ProblemDetails
- All error responses (400, 401, 429, 500) use `application/problem+json`
- Consistent `{ title, status, detail, instance, traceId }` schema
- `AddProblemDetails()` + custom `InvalidModelStateResponseFactory`
- `ProblemDetailsJson` helper (camelCase serialization) — 150 tests

### Milestone 16 — Reverse-Proxy Forwarded Headers
- `ForwardedHeadersSetup` + `ReverseProxyOptions` (`ReverseProxy:*` config section)
- `UseForwardedHeaders` (`X-Forwarded-For`/`X-Forwarded-Proto`) — real client IP behind nginx/Caddy
- Opt-in (`Enabled=false` default), trust additive (loopback defaults preserved)
- CIDR parsing via `System.Net.IPNetwork` — 184 tests

### Milestone 17 — Model-Catalog Configurability
- `ModelCatalogService` accepts single JSON-array env var (`Models__Agent`/`Models__Direct`)
- Malformed JSON logged and falls back to defaults
- Docker-compose forwards catalog vars; frontend node-based readiness healthcheck — 189 tests

### Milestone 18 — SSE Error Sanitization & Project Metadata
- `ChatController.StreamChat` catch block sends generic error event (not `ex.Message`)
- `ChatService.ProduceTokensAsync` upstream-error message sanitized (no HTTP status code)
- Frontend `App.tsx` handles `parsed.error` in SSE events and displays them
- MIT `LICENSE` file added; CI workflow: NuGet cache + frontend `npm run lint` — 200 tests

---

## License

MIT License — see [LICENSE](LICENSE).
