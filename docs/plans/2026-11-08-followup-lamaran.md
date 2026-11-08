# Plan: Track Lamaran + Follow-up (2026-11-08)

## Problem
Job pipeline sudah bisa ubah status dari web (PATCH /api/jobs/{id}/status).
Namun lowongan yang sudah dilamar/interview tidak punya cara mencatat *kapan harus
follow-up*. Kontrak berakhir 30 Des 2026 — pengguna butuh pengingat visual untuk
mengejar lamaran yang belum dibalas.

## Scope (minimal, anti-over-engineering)
Tidak membuat sistem reminder cron terpisah. Cukup:
1. Kolom `FollowUpTanggal` (nullable DateOnly) di entity Opportunity.
2. Endpoint `PATCH /api/jobs/{id}/follow-up` untuk set/hapus tanggal.
3. Frontend: badge "Perlu follow-up" + kontrol "Atur follow-up" per kartu.

## Backend
- `Domain/Entities/Opportunity.cs`: tambah `public DateOnly? FollowUpTanggal { get; set; }`.
- `Application/Interfaces/IOpportunityRepository.cs`: tambah
  `Task<bool> UpdateFollowUpAsync(long id, DateOnly? tanggal, CancellationToken ct)`.
- `Infrastructure/Data/OpportunityRepository.cs`: implement — update hanya kolom itu.
- `Controllers/JobsController.cs`: tambah
  `PATCH {id}/follow-up`, body `{ tanggal?: string | null }` → 204/400/404.
- Migration EF: `AddOpportunityFollowUp`.

## Frontend
- `jobsApi.ts`: `updateOpportunityFollowUp(id, tanggal | null)`.
- `hooks/useJobs.ts`: expose `updateFollowUp` + `updatingId`.
- `components/JobsView.tsx`:
  - Jika `FollowUpTanggal` ada & <= hari ini & status aktif (applied/interview)
    → badge "Perlu follow-up" (warna warning).
  - Tombol kecil "Atur follow-up" → input date inline → simpan / hapus.

## Test
- Backend: `JobsControllerFollowUpTests` (204/400/404).
- Frontend: perpanjang jobsApi/useJobs/JobsView test.

## Kriteria selesai
- Backend & frontend build hijau, tsc 0, seluruh test lulus.
- Deploy otomatis via push.
