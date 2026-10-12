# Milestone 24 — nginx frontend proxy fix + non-root hardening

## Problem

The frontend Docker image switched from `vite preview` to `nginx:alpine` (commits
e7b0ec6, fd8e6d3) but:

1. **Critical**: `frontend/nginx.conf` had no `/api` proxy — API calls from Docker
   frontend returned 404 (nginx served `index.html` instead of proxying to backend).
2. `VITE_API_PROXY_TARGET` env var in docker-compose was stale (nginx doesn't read it).
3. Frontend service lost `cap_drop: ALL` + `no-new-privileges` (removed for root nginx).
4. Frontend Dockerfile had no `USER` directive (ran as root).
5. 5 deployment config tests failed (expected old vite-preview setup).
6. Deployment docs still referenced "vite preview".

## Changes

### frontend/nginx.conf
- Added `location /api/` with `proxy_pass http://backend:5184`
- SSE support: `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 86400s`
- Forwarded headers: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto

### frontend/Dockerfile
- `USER nginx` (non-root, UID 101 in nginx:alpine)
- Pre-create + chown cache/temp dirs → no CAP_CHOWN needed
- Redirect PID path to `/tmp/nginx.pid` (writable by non-root)
- Remove `user` directive from nginx.conf (meaningless when already non-root)

### docker-compose.yml
- Removed `VITE_API_PROXY_TARGET` from frontend environment
- Re-added `security_opt: ["no-new-privileges:true"]`
- Re-added `cap_drop: ALL`

### Tests
- Fixed 3 existing tests (USER nginx, chown nginx, wget healthcheck)
- Added 7 new tests (nginx proxy, SSE, port, SPA fallback, cache dirs, PID path, VITE removal)

### Docs
- deployment.md: all vite preview → nginx references updated
- .env.example: VITE_API_PROXY_TARGET marked local-dev-only
- README.md: Docker section + Milestone 24 entry
- CHANGELOG.md: Milestone 24 entry
