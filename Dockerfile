# ── Stage 1: Build ──
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project file and restore dependencies (cache layer)
COPY src/OmniChat.Api/OmniChat.Api.csproj ./OmniChat.Api/
RUN dotnet restore ./OmniChat.Api/OmniChat.Api.csproj

# Copy source and build
COPY src/OmniChat.Api/ ./OmniChat.Api/
RUN dotnet publish ./OmniChat.Api/OmniChat.Api.csproj -c Release -o /app/publish --no-restore

# ── Stage 2: Runtime ──
# Backend runtime ships no curl/wget (dotnet-docker#2379). Healthchecks need an HTTP probe.
# installing curl from the Ubuntu archives broke deploys when those mirrors were unresolvable on the VPS.
# Copy the static BusyBox binary (same multi-call approach as frontend nginx:alpine).
FROM busybox:stable AS busybox
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Path the static BusyBox binary and expose it as `wget`. BusyBox dispatches
# on the invocation name, so the `wget` symlink works out of the box. Statically
# linked, so no extra libraries or apt dependency is needed on Ubuntu.
COPY --from=busybox /bin/busybox /usr/local/bin/busybox
RUN ln -s /usr/local/bin/busybox /usr/local/bin/wget \
    && chmod +x /usr/local/bin/busybox

# Copy the published app as the non-root `app` user (UID 101, built into the
# aspnet base image since .NET 8). The app listens on port 5184 (>1024) so
# non-root can bind. BusyBox wget is installed system-wide and accessible to all users.
COPY --from=build --chown=app:app /app/publish .

# Chat history lives on a named volume mounted at /data. Docker seeds a fresh volume
# from the image path, ownership included, so the directory must already belong to
# `app` — otherwise SQLite cannot create the database file and history silently fails.
RUN mkdir -p /data && chown app:app /data

USER app

EXPOSE 5184

ENV ASPNETCORE_URLS=http://+:5184
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check for plain `docker run` (docker-compose overrides this). BusyBox
# `wget -q --spider` issues a HEAD request and exits non-zero on failure, so
# Docker sees the container as unhealthy when the API is down.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:5184/health || exit 1

ENTRYPOINT ["dotnet", "OmniChat.Api.dll"]
