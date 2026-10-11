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
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# curl is NOT bundled in the .NET runtime images (mcr.microsoft.com/dotnet/aspnet),
# but both the Dockerfile HEALTHCHECK below and the docker-compose backend
# healthcheck invoke `curl -f http://localhost:5184/health`. Without it the
# container is permanently "unhealthy" and every dependent service
# (frontend: depends_on: service_healthy) never starts. Install it explicitly.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

EXPOSE 5184

ENV ASPNETCORE_URLS=http://+:5184
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check for plain `docker run` (docker-compose overrides this). `--fail`
# makes curl exit non-zero on HTTP >= 400 so Docker sees the container as unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent --show-error http://localhost:5184/health || exit 1

ENTRYPOINT ["dotnet", "OmniChat.Api.dll"]
