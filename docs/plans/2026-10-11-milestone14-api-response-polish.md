# Milestone 14: API Response Quality Polish

**Date:** 2026-10-11
**Goal:** Production-grade API response polish — rate-limit `Retry-After` header, response compression, model catalog cache headers, frontend 429 handling, README cleanup. All stateless, no DB.

## Tasks

### Task 1: Rate-limit `Retry-After` header
- Add `OnRejected` callback to the rate limiter that sets `Retry-After` header (seconds until next token)
- Test: 429 response includes `Retry-After` header

### Task 2: Response compression
- Add `AddResponseCompression` (gzip + brotli) and `UseResponseCompression` in the pipeline
- Exclude `text/event-stream` (SSE must not be compressed)
- Test: `/health` response has `Content-Encoding: gzip` when `Accept-Encoding: gzip`

### Task 3: `/api/models` cache headers
- Add `[ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any)]` to `GetModels`
- Test: response includes `Cache-Control: public,max-age=60`

### Task 4: Frontend 429 handling
- Read `Retry-After` header from 429 response and show it in the error message
- Frontend build must still pass

### Task 5: README cleanup + OpenAPI docs
- Remove duplicate "Docker Compose memory limits" line
- Add note about OpenAPI `/openapi/v1.json` available in Development
- Add M14 to milestones section
- Document new features

### Task 6: Verification
- `dotnet build OmniChat.slnx -c Release` — 0 warnings
- `dotnet test OmniChat.slnx -c Release` — all pass
- `cd frontend && npm run build` — pass
- Commit + push + check CI
