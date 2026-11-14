# Cycle 139 — Events CSV export (backend + frontend)

Events view lacked CSV export while Jobs had it. Mirrored the Jobs export pattern.

- Backend: `GET /api/events/export` — RFC 4180, UTF-8 BOM, optional `aplikasi` filter.
  Columns: aplikasi,judul,benefit,syarat,berlakuSampai,ditemukan,link,sourceId.
  New `EventsControllerExportTests` (4 cases). Backend suite 670 → 674.
- Frontend: `exportEventsCsv` in eventsApi.ts (auth header, `aplikasi` query param);
  EventsView header button "Ekspor CSV" respects active app filter, disables while
  loading, localized `Gagal mengekspor CSV.` alert on failure. New transport test file
  `eventsApi-export.test.ts` (3 cases) + EventsView export describe (3 cases).
  Frontend suite 1150 → 1156.
- All green: backend 674, frontend 1156, tsc -b, oxlint.
- Commit SHA: 3543fe5.
