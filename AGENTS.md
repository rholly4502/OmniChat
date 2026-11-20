# AGENTS.md — Instruksi Agent untuk OmniChat

Aturan di bawah adalah kontrak wajib untuk setiap AI coding agent (termasuk scheduled improvement worker) yang bekerja di repository `OmniChat`. Ringkas, tegas, dan melengkapi tooling deterministik yang sudah terpasang (Roslyn analyzers, `BannedSymbols.txt`, `NetArchTest`, dan CI).

---

## 1. Struktur & Batas Arsitektur

- `src/OmniChat.Api` — Backend .NET 10 dengan Clean Architecture (`Domain`, `Application`, `Infrastructure`, `Controllers`).
  - `Controllers` dilarang menginjeksi `DbContext` atau mengakses layer `Infrastructure` secara langsung.
  - Ikuti pola referensi fitur **Expenses** untuk struktur endpoint, handler/service, DTO, dan test.
- `src/OmniChat.Seeder` — CLI seeder data (wajib propagasi `CancellationToken` sampai ke operasi I/O).
- `frontend/` — Frontend React + TypeScript + Vite (dilengkapi `oxlint` dan test).
- `tests/OmniChat.Tests` — Unit & integration tests.
- `tests/OmniChat.ArchitectureTests` — Architecture gate berbasis `NetArchTest` (wajib tetap hijau).

---

## 2. Hard Guardrails (Dilarang Dilanggar)

1. **Zero Linter / Analyzer Bypass:**
   - Dilarang keras menambahkan `#pragma warning disable`, `[SuppressMessage]`, `NoWarn`, atau menurunkan severity rule di `.editorconfig` / `Directory.Build.props`.
   - Patuhi seluruh aturan deterministik: `DL100`/`DL101` (`CancellationToken` di method async), `RS0030` (`BannedSymbols.txt`: dilarang `Task.Wait`, `Task<T>.Result`, `Thread.Sleep`, `DateTime.Now`, `new HttpClient()`), `CA1305`/`S6580`/`CA1862` (`CultureInfo.InvariantCulture` & `StringComparison`), serta `SonarAnalyzer.CSharp` dan `AsyncFixer`. Perbaiki akar masalahnya.
2. **Zero Test Cheating:** Dilarang menghapus, men-`Skip`, atau melemahkan assertion di `OmniChat.Tests` maupun `OmniChat.ArchitectureTests`.
3. **No Comment Slop:** Jangan menulis komentar yang hanya mengulang apa yang sudah jelas dari kode (komentar hanya untuk menjelaskan *mengapa* pada keputusan non-obvious).
4. **Anti-Over-Refactoring:** Karena `OmniChat` sudah live di production, dilarang merombak struktur folder, mengganti arsitektur besar, mengubah skema migrasi lama, atau melakukan mass-renaming di luar scope 1 task.
5. **Satu Task = Satu PR Kecil:** Maksimal ~300 baris perubahan logic per PR (di luar unit test dan lockfile). Pecah perubahan besar menjadi beberapa PR kecil bertahap.
6. **Kontrol Antrean PR (Khusus Worker Otomatis):**
   - Sebelum membuat branch/PR baru, cek daftar PR yang masih `open`. Jika sudah ada **>= 3 PR terbuka**, hentikan eksekusi (no-op) agar antrean review tidak menumpuk.
   - Hindari menyentuh area/file yang sedang dimodifikasi oleh PR terbuka lain.
7. **Dilarang Push/Merge ke `main`:** Worker hanya boleh bekerja di branch terpisah (`agent/<tipe>-<slug-singkat>`) dan membuka Pull Request. Jangan force-push atau auto-merge.
8. **No-Op Lebih Baik dari PR Kosong:** Jika tidak ada perbaikan nyata yang terukur, keluar tanpa membuat PR.

---

## 3. Wajib Verifikasi (Sebelum Membuka PR / Menyatakan Selesai)

Jalankan seluruh verifikasi berikut sampai hijau:
- `dotnet build OmniChat.slnx` (0 error, 0 pelanggaran analyzer)
- `dotnet test tests/OmniChat.Tests/OmniChat.Tests.csproj`
- `dotnet test tests/OmniChat.ArchitectureTests/OmniChat.ArchitectureTests.csproj`
- Jika menyentuh `frontend/`: jalankan lint (`oxlint` / `npm run lint` jika tersedia), test, dan `npm run build` di folder `frontend/`.

---

## 4. Prioritas Improvement (Urutan Kerja Worker)

Pilih **satu** task terkecil dengan dampak tertinggi dari prioritas teratas:

1. **P1 — Stabilitas, CI & Production Safety:** Perbaikan build/test gagal, bug production, kebocoran resource/cancellation, hardening auth/validasi/rate-limit, atau perbaikan regression pada `ci.yml`/`deploy.yml`.
2. **P2 — Backlog & Dokumen Rencana:** Item yang tercatat di `docs/` atau issue terbuka.
3. **P3 — Kualitas Arsitektur, Performa & Fitur Terarah:**
   - Penambahan aturan baru di `OmniChat.ArchitectureTests` untuk memperketat boundary Clean Architecture.
   - Optimasi query EF Core (mis. `AsNoTracking`, pencegahan N+1, pagination yang konsisten) atau resiliensi integrasi eksternal (`IHttpClientFactory`, timeout, cancellation).
   - Penyempurnaan fitur terarah mengikuti pola referensi fitur `Expenses`.
4. **P4 — Test Coverage & Frontend Polish:** Penambahan unit/integration test untuk edge case nyata dan perbaikan UX/aksesibilitas kecil di `frontend/`.

---

## 5. Format Deskripsi Pull Request

Setiap PR yang dibuat agent wajib memuat:
- **Tujuan:** Masalah atau improvement yang diselesaikan (1–2 kalimat).
- **Perubahan Utama:** Daftar ringkas file dan perubahan logic.
- **Verifikasi:** Ringkasan hasil `dotnet test` (baik `OmniChat.Tests` maupun `OmniChat.ArchitectureTests`, serta build/test `frontend/` bila relevan).
- **Cek Guardrails:** Konfirmasi tidak ada bypass linter/analyzer dan aturan Clean Architecture tetap terjaga.
