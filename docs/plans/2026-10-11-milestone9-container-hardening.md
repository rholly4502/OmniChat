# Milestone 9 — Container & Deployment Hardening

## Problem (verified)
1. **Healthcheck is dead on arrival.** `docker-compose.yml` backend healthcheck runs
   `curl -f http://localhost:5184/health`, but `curl` is **not** present in
   `mcr.microsoft.com/dotnet/aspnet:10.0` (Microsoft: "curl isn't included in the
   .NET Linux container images"; dotnet-docker#2379). The container never reports
   `healthy`, so `frontend.depends_on.backend.condition: service_healthy` never
   fires and the frontend never starts.
2. **No `.dockerignore`.** The build context includes `.env` (secrets), `node_modules/`,
   `bin/`, `obj/`, `.git/` — bloating the context and risking secrets/artifacts in
   image layers (frontend Dockerfile does `COPY frontend/ .`).
3. **Frontend runtime image is non-reproducible.** `RUN npm install --omit=dev vite
   || npm install vite` installs a floating vite version (vite is a devDependency,
   so the first form always fails). Should use the lockfile (`npm ci`).

## Plan
- [x] Add root `.dockerignore` (exclude .env, node_modules, bin, obj, dist, .git).
- [x] `Dockerfile`: install `curl` in the runtime stage + add a `HEALTHCHECK` directive.
- [x] `frontend/Dockerfile`: reproducible runtime deps via `npm ci` from the lockfile.
- [x] `docs/deployment.md` + `.env.example`: document the healthcheck/curl dependency.
- [x] Extend `DeploymentConfigTests` with regression guards:
      - `.dockerignore` exists and ignores the sensitive paths;
      - compose healthcheck's binary is provided by the image (curl ⇒ Dockerfile installs curl);
      - compose forwards `Security__ApiKey` and `Cors__AllowedOrigins`.
- [x] README: Milestone 9 entry.
- [x] Verify: `dotnet build/test -c Release`, `npm run build`, CI green.

Constraint: **stateless** — no DB/EF/persistence.
