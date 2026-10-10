# Implementation Plan: Milestone 2 — Quality, Testing & Resilience
**Date:** 2026-10-10
**Feature:** Hardening OmniChat with tests, security fixes, validation, and health checks

## Context
Milestone 1 delivered the core SSE streaming chat with Clean Architecture. The build succeeds but has 2 warnings: CA2024 (async EndOfStream) and NU1903 (Microsoft.OpenApi vulnerability). No test project exists. Milestone 2 adds quality gates, resilience, and production hardening.

## Tasks

### Task 1: Fix CA2024 — Replace EndOfStream with async ReadLineAsync pattern
- **File:** `src/OmniChat.Api/Infrastructure/Services/ChatService.cs`
- **Change:** Replace `while (!reader.EndOfStream)` + `reader.ReadLineAsync(ct)` with `while ((line = await reader.ReadLineAsync(ct)) != null)` loop
- **Test:** Build with 0 warnings
- **Commit:** `fix: replace EndOfStream with async ReadLineAsync (CA2024)`

### Task 2: Resolve NU1903 — Update Microsoft.OpenApi to patched version
- **File:** `src/OmniChat.Api/OmniChat.Api.csproj`
- **Change:** Update or remove explicit Microsoft.OpenApi pin; check if newer version fixes the advisory
- **Test:** `dotnet restore` + build with no NU1903 warning
- **Commit:** `fix: resolve Microsoft.OpenApi vulnerability advisory (NU1903)`

### Task 3: Create xUnit test project
- **Files:** `tests/OmniChat.Tests/OmniChat.Tests.csproj`, `tests/OmniChat.Tests/Usings.cs`
- **References:** OmniChat.Api project, xUnit, Moq, FluentAssertions
- **Test:** `dotnet test` runs with 0 tests (empty runner)
- **Commit:** `feat: add xUnit test project scaffold`

### Task 4: Write ChatService unit tests
- **File:** `tests/OmniChat.Tests/Services/ChatServiceTests.cs`
- **Tests:**
  - `StreamChatResponseAsync_FallbackSimulation_WhenEndpointUnreachable_ProducesTokens`
  - `StreamChatResponseAsync_WithHermesBridge_UsesCorrectEndpoint`
  - `StreamChatResponseAsync_ParsesSSEChunksCorrectly`
- **Test:** `dotnet test` — all pass
- **Commit:** `test: add ChatService unit tests for SSE parsing and fallback`

### Task 5: Write ChatController unit tests
- **File:** `tests/OmniChat.Tests/Controllers/ChatControllerTests.cs`
- **Tests:**
  - `StreamChat_ReturnsSSEContentType`
  - `StreamChat_ReturnsDoneMarker`
- **Test:** `dotnet test` — all pass
- **Commit:** `test: add ChatController unit tests`

### Task 6: Add Health Check endpoint
- **File:** `src/OmniChat.Api/Program.cs`
- **Change:** `builder.Services.AddHealthChecks()`, `app.MapHealthChecks("/health")`
- **Test:** Build succeeds; endpoint registered
- **Commit:** `feat: add /health endpoint`

### Task 7: Add request validation
- **File:** `src/OmniChat.Api/Domain/Models/ChatRequest.cs`
- **Change:** Add DataAnnotations validation (`[Required]` on Messages, model validation in controller)
- **Test:** Build succeeds; invalid request returns 400
- **Commit:** `feat: add ChatRequest validation with DataAnnotations`

### Task 8: Add structured error handling middleware
- **File:** `src/OmniChat.Api/Infrastructure/Middleware/ExceptionHandlingMiddleware.cs`
- **Change:** Global try-catch middleware returning JSON error responses
- **Test:** Build succeeds
- **Commit:** `feat: add global exception handling middleware`

### Task 9: Update CI to run tests
- **File:** `.github/workflows/ci.yml`
- **Change:** Add `dotnet test` step to backend job
- **Test:** YAML valid
- **Commit:** `ci: add dotnet test to backend job`

### Task 10: Create solution file and add projects
- **File:** `OmniChat.sln`
- **Change:** Create solution, add both main and test projects
- **Test:** `dotnet sln list` shows both projects
- **Commit:** `chore: add solution file with test project`
