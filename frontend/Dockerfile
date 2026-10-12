# Stage 1: Build React app
FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Serve static files with nginx (non-root)
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Pre-create and chown nginx cache/temp dirs so the container can run as
# non-root (USER nginx) without CAP_CHOWN. Also fix the PID path to /tmp
# (writable by non-root) and remove the 'user' directive (meaningless when
# already running as the nginx user).
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
        /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
        /var/cache/nginx/scgi_temp \
    && chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html /etc/nginx/conf.d \
    && sed -i '/^user /d' /etc/nginx/nginx.conf \
    && sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf

USER nginx

EXPOSE 4173
