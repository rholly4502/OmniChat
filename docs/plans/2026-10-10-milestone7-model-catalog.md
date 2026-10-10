# Milestone 7 — Dynamic Model Catalog (`GET /api/models`)

## Goal
Remove hardcoded model lists from the React frontend by exposing a
configuration-driven catalog from the backend. Frontend fetches it at boot.

## Why
DRY + Clean Architecture: model options belong to the backend contract, not
the UI. Enables per-environment model sets without a frontend rebuild.

## Tasks
### Task 1 — Domain + Application contracts
- `Domain/Models/ModelInfo.cs`     : `record ModelInfo(string Id, string Label)`
- `Domain/Models/ModelCatalog.cs`  : `record ModelCatalog(IReadOnlyList<ModelInfo> Agent, IReadOnlyList<ModelInfo> Direct)`
- `Application/Interfaces/IModelCatalogService.cs` : `ModelCatalog GetCatalog()`

### Task 2 — Infrastructure service (TDD)
- `Infrastructure/Services/ModelCatalogService.cs`
  - Reads `Models:Agent` / `Models:Direct` (`List<ModelInfo>`) from IConfiguration.
  - Falls back to sane defaults when a section is missing/empty.
- Test `Services/ModelCatalogServiceTests.cs`:
  - configured values returned for both modes
  - empty config -> defaults (non-empty, contains `hermes`)

### Task 3 — Endpoint (integration TDD)
- `GET /api/models` on ChatController -> 200 JSON `{ agent: [...], direct: [...] }`.
- Register `IModelCatalogService` in Program.cs.
- Integration test `Integration/ModelsEndpointIntegrationTests.cs`.

### Task 4 — Config, frontend, docs
- Add `Models` section to appsettings(.Development).json.
- Frontend: fetch catalog from `/api/models`, fall back to local defaults.
- Update README feature list.

## Verification
- `dotnet build OmniChat.slnx -c Release` -> 0 warnings
- `dotnet test OmniChat.slnx -c Release` -> all green (67 existing + new)
- `cd frontend && npm run build` -> compiles
