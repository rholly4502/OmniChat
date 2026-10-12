# Milestone 20 — Non-root container hardening + API reference

## Goal
1. Run both containers as non-root users (backend: `app` UID 101, frontend: `node` UID 1000)
2. Add `security_opt: no-new-privileges` + `cap_drop: ALL` to docker-compose
3. Add structured API reference section to README with endpoints, curl examples, schemas
4. Add deployment config regression tests for all of the above
5. Update CHANGELOG + deployment.md

## Tasks

### Task 1: Backend Dockerfile — non-root `app` user
- Add `--chown=app:app` to the `COPY --from=build` line
- Add `USER app` before ENTRYPOINT
- apt-get install curl still runs as root (before USER switch)

### Task 2: Frontend Dockerfile — non-root `node` user
- Add `--chown=node:node` to COPY lines
- Add `USER node` before CMD
- npm ci runs as root (creates root-owned node_modules, readable by node)

### Task 3: docker-compose.yml — security options
- Add `security_opt: ["no-new-privileges:true"]` to both services
- Add `cap_drop: ["ALL"]` to both services

### Task 4: Deployment config tests
- Test backend Dockerfile has `USER app`
- Test frontend Dockerfile has `USER node`
- Test docker-compose has `no-new-privileges` on both services
- Test docker-compose has `cap_drop` on both services

### Task 5: README API reference
- Add API Reference section with endpoint table, curl examples, request/response schemas, SSE format, error format

### Task 6: CHANGELOG + deployment.md update
- Add Milestone 20 entry to CHANGELOG
- Add non-root container note to deployment.md
