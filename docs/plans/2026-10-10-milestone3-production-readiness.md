# Implementation Plan: Milestone 3 — Production Readiness
**Date:** 2026-10-10
**Feature:** Docker containerization, environment config, rate limiting, integration tests, deployment

## Context
Milestone 1 delivered core SSE streaming with Clean Architecture. Milestone 2 added quality gates (tests, validation, health checks) and frontend polish (stop button, auto-scroll, markdown, model selector). Milestone 3 focuses on production readiness: containerization, environment-based configuration, rate limiting, integration tests, and deployment documentation.

## Tasks

### Task 1: Environment-based configuration
- **Files:** `src/OmniChat.Api/appsettings.Development.json`, `src/OmniChat.Api/appsettings.Production.json`
- **Change:** Split configuration by environment — Development uses localhost endpoints, Production uses env vars
- **Test:** Build succeeds; `dotnet run --environment Development` loads correct config
- **Commit:** `feat: add environment-based configuration files`

### Task 2: Rate limiting middleware
- **File:** `src/OmniChat.Api/Program.cs`
- **Change:** Add `AddRateLimiter` with token bucket policy (e.g., 10 req/min per IP for chat endpoint)
- **Test:** Build succeeds; rate limiter middleware registered
- **Commit:** `feat: add rate limiting middleware`

### Task 3: Dockerfile for backend
- **File:** `Dockerfile`
- **Change:** Multi-stage build — SDK stage restores/builds, runtime stage serves the API
- **Test:** `docker build -t omnichat-api .` succeeds
- **Commit:** `feat: add Dockerfile for backend`

### Task 4: docker-compose.yml
- **File:** `docker-compose.yml`
- **Change:** Define backend service (port 5184) and frontend service (port 5173) with env vars
- **Test:** `docker compose config` validates YAML
- **Commit:** `feat: add docker-compose for backend + frontend`

### Task 5: Integration tests with WebApplicationFactory
- **File:** `tests/OmniChat.Tests/Integration/ChatEndpointIntegrationTests.cs`
- **Change:** Test full HTTP pipeline — POST /api/chat/stream returns SSE, /health returns 200, invalid request returns 400
- **Test:** `dotnet test` — integration tests pass
- **Commit:** `test: add integration tests with WebApplicationFactory`

### Task 6: Enhanced OpenAPI documentation
- **File:** `src/OmniChat.Api/Controllers/ChatController.cs`
- **Change:** Add OpenAPI metadata (summary, response types, tags)
- **Test:** Build succeeds; `/openapi/v1.json` contains endpoint descriptions
- **Commit:** `docs: enhance OpenAPI documentation`

### Task 7: Deployment guide
- **File:** `docs/deployment.md`
- **Change:** Document Docker deployment, env vars, proxy configuration, health checks
- **Test:** File exists; markdown valid
- **Commit:** `docs: add deployment guide`

### Task 8: README update
- **File:** `README.md`
- **Change:** Full setup instructions — prerequisites, local dev, Docker, testing, architecture overview
- **Test:** File exists; markdown valid
- **Commit:** `docs: update README with full setup instructions`
