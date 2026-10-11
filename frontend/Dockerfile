# ── Stage 1: Build ──
FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Serve via Vite preview ──
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=build /app/dist ./dist
# Reinstall the runtime dependencies from the lockfile (`npm ci`) so `vite preview`
# uses the exact pinned version instead of an unpinned, floating resolution.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

EXPOSE 4173
# `vite preview` proxies /api to $VITE_API_PROXY_TARGET (see frontend/vite.config.ts);
# docker-compose sets it to http://backend:5184.
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
