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
COPY --from=build /app/publish .

EXPOSE 5184

ENV ASPNETCORE_URLS=http://+:5184
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "OmniChat.Api.dll"]
