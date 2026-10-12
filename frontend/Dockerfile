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

# Copy the built assets and lockfile as the non-root `node` user (UID 1000,
# built into node:22-alpine). npm ci runs as root (root-owned node_modules
# are read-only and readable by node). `vite preview` only reads from dist/
# and node_modules/ — no write access needed. Port 4173 > 1024 so non-root
# can bind.
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
# Copy the minimal preview-only config as vite.config.ts so `vite preview`
# picks up allowedHosts, proxy, port, and host settings without importing
# dev-only packages (vitest, react plugin, tailwindcss plugin).
COPY --chown=node:node frontend/vite.preview.config.ts ./vite.config.ts
RUN npm ci
USER node

EXPOSE 4173
# `vite preview` proxies /api to $VITE_API_PROXY_TARGET (see frontend/vite.config.ts);
# docker-compose sets it to http://backend:5184.
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
