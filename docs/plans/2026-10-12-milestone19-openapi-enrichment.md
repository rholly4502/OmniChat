# Milestone 19: OpenAPI Document Enrichment + CHANGELOG

## Goal
Enrich the bare OpenAPI document (`/openapi/v1.json`) with project-level metadata
(title, description, version, contact, license), add the missing `401` response
type to `StreamChat`, and add a formal `CHANGELOG.md` for portfolio readability.

## Tasks

### T1: Create OpenApiDocumentTransformer
- **Write:** `src/OmniChat.Api/Infrastructure/OpenApi/OpenApiDocumentTransformer.cs`
- `IOpenApiDocumentTransformer` sets `OpenApiInfo`: Title="OmniChat API",
  Description, Version="v1", Contact (name + GitHub URL), License (MIT + URL).
- **Check:** compiles.

### T2: Register transformer in Program.cs
- Replace `builder.Services.AddOpenApi();` with `AddOpenApi(options => options.AddDocumentTransformer<OpenApiDocumentTransformer>())`.
- **Check:** build passes.

### T3: Add missing 401 to StreamChat
- Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` to `StreamChat`.
- **Check:** build passes.

### T4: Integration tests for OpenAPI metadata
- **Write:** `tests/OmniChat.Tests/Integration/OpenApiMetadataIntegrationTests.cs`
- GET `/openapi/v1.json` in Development → verify JSON contains:
  `info.title` = "OmniChat API", `info.version` = "v1",
  `info.license.name` = "MIT", `info.contact.name` = "Rholly".
- **Check:** `dotnet test` passes (red → green).

### T5: Deployment config guards
- Extend `DeploymentConfigTests` to verify:
  - `Program.cs` registers `AddDocumentTransformer`
  - `ChatController.StreamChat` has `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`
- **Check:** tests pass.

### T6: CHANGELOG.md
- **Write:** root `CHANGELOG.md` with all milestones (1–19) summarized.
- **Check:** file exists, content verified.

### T7: README update
- Add CHANGELOG link, mention enriched OpenAPI schema.
- Update milestone list with M19 entry.

### T8: Verify
- `dotnet build OmniChat.slnx -c Release` — 0 warnings
- `dotnet test OmniChat.slnx -c Release` — all pass
- `cd frontend && npm run build` — passes
- Commit + push, verify CI green via `gh run list`.
