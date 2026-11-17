# Changelog

All notable changes to OmniChat are documented here.
The project follows [Keep a Changelog](https://keepachangelog.com/) conventions.

## [Unreleased]
### P20 — Expenses: unit test controller `ExpensesController` (backend)

#### Added
- `tests/.../Controllers/ExpensesControllerTests.cs`: 23 test baru menutup celah
  cakupan `ExpensesController` (domain Pengeluaran) — sebelumnya tidak punya test
  unit sama sekali. Meliputi list paged (terbaru dulu + validasi bulan), summary
  (total per kategori, sisa anggaran), target GET/PUT (upsert + flag
  `IsUserEdited` + validasi), sisa kas (pemasukan − pengeluaran − nabung),
  ekspor CSV (BOM UTF-8 + hormati filter kategori) dan PDF, trend (zero-filled),
  advice (tanggal valid/tidak valid), serta CRUD web (tombstone delete).
- Full suite backend kini 743 test hijau; build 0 warning / 0 error.
### P19 — Navigasi: deep-link view via URL hash (frontend)

#### Added
- View-switcher (Ringkasan/Chat/Pengeluaran/Lowongan/Event) kini sinkron dengan
  URL hash (`#chat`, `#expenses`, `#jobs`, `#events`) — setiap view dapat
  dibookmark/dibagikan lewat tautan, dan tombol back/forward browser mengembalikan
  view sebelumnya. Hash kosong/asing jatuh balik ke Ringkasan.
- Tests: +5 komponen (App) — default Ringkasan, muat dari hash, hash asing,
  tulis hash saat pindah view, ikuti `hashchange` (back/forward). Full suite
  frontend hijau: tsc -b, oxlint bersih, 75 file/1247 test lulus, build prod ok.

### P18 — Events: ekspor CSV menghormati pencarian keyword & sembunyikan kedaluwarsa (backend + frontend)

#### Changed
- Backend `GET /api/events/export` kini menerima dua filter tambahan di samping
  `aplikasi`: `q` (kata kunci, case-insensitive atas judul/aplikasi/benefit/
  syarat) dan `hideExpired` (buang promo yang kedaluwarsa). Semantik kadaluwarsa
  menyamai frontend: hanya tanggal akhir yang ter-parse sebagai `YYYY-MM-DD` dan
  sudah lewat yang dianggap kedaluwarsa — baris tanpa tanggal akhir / teks bebas
  tetap disertakan (dihitung "aktif").
- Frontend: `exportEventsCsv` menerima `q` dan `hideExpired`; tombol "Ekspor CSV"
  di view Events kini mengirim seluruh filter aktif (aplikasi + pencarian + toggle
  "Sembunyikan kedaluwarsa"), sehingga file yang diunduh persis baris di layar.
- Tests: +3 backend (filter keyword, sembunyikan kedaluwarsa, tanpa filter tetap
  menyertakan semua), +2 frontend transport (`q`/`hideExpired` di query string),
  +1 komponen EventsView (forward filter aktif). Hijau: backend 720, frontend tsc
  -b + oxlint bersih.



#### Added
- Kartu "Pengeluaran (bulan ini)" di Ringkasan kini menampilkan **Anggaran**
  (plafon budget bulanan) di antara "Total bulan ini" dan "Sisa anggaran" —
  sehingga angka sisa anggaran punya konteks (plafon berapa). Menampilkan
  "—" bila anggaran belum ditetapkan (konsisten dengan baris lain).
- Tests: +1 komponen (SummaryView) — baris Anggaran dirender dengan locale
  id-ID dari data summary. Full suite frontend hijau: tsc -b, oxlint tanpa
  warning baru.

### P16 — Ringkasan: kartu Promo/Event pakai endpoint ringkasan `GET /api/events/summary` (backend + frontend)

#### Added
- Endpoint baru `GET /api/events/summary` — ringkasan ringan daftar promo
  terkurasi (cermin pola `/api/jobs/summary`), mengembalikan **total**,
  **sumber unik** (jumlah platform/aplikasi berbeda), dan ember urgensi
  berakhir relatif terhadap hari ini (WIB): **berakhir hari ini**, **besok
  berakhir**, dan **dalam 7 hari**. Repo memuat hanya kolom `Aplikasi` +
  `BerlakuSampai` (bukan seluruh baris); tanggal akhir yang tidak bisa
  di-parse sebagai `YYYY-MM-DD` (kosong / teks bebas) tidak masuk ember mana
  pun — konsisten dengan semantik frontend yang menampilkannya sebagai
  "aktif" alih-alih menghitungnya sebagai segera habis.
- Frontend: kartu "Promo / Event" di Ringkasan kini mengonsumsi endpoint
  tersebut lewat hook baru `useEventsSummary` (bukan lagi menarik **seluruh**
  daftar event hanya untuk digest). Gating loading/error dan tombol muat
  ulang ikut berpindah; tombol "Muat ulang" pada banner error kini juga
  menyegarkan tren pengeluaran (`trend.reload()`, sebelumnya tidak ikut).
- Tests: +3 backend (2 unit repository SQLite in-memory: bucket vs `today`
  + kasus kosong; 1 controller 200 + bentuk `EventsSummary`). +2 frontend
  hook (`useEventsSummary`); test SummaryView yang menguji kartu promo
  diperbarui untuk men-stub `/api/events/summary`. Full suite backend 717
  pass, frontend hijau (tsc -b, oxlint tanpa warning baru).


### P15 — Ringkasan: perbandingan pengeluaran vs bulan lalu (frontend)

#### Added
- Kartu "Pengeluaran (bulan ini)" di Ringkasan kini menampilkan **Dibanding
  bulan lalu** — selisih total belanja bulan ini terhadap bulan sebelumnya
  (dari endpoint `GET /api/expenses/trend`, yang sudah mengecualikan setoran
  Nabung sehingga angka konsisten dengan "Total bulan ini"). Selisih positif
  (merah = boros), negatif (emerald = lebih hemat), dan nol (netral) dirender
  dengan tone masing-masing. Baris hanya muncul bila terdapat bulan sebelumnya di
  serial tren; tanpa data, baris disembunyikan (best-effort, tidak ikut
  menggatalkan kartu lain).
- Tests: +2 komponen (SummaryView) — baris selisih dirender dari data trend
  (dengan tanda + dan lokale id-ID), dan tersembunyi saat tidak ada bulan
  sebelumnya. Full suite frontend hijau: tsc -b, oxlint tanpa warning baru.

### P14 — Ringkasan: stat tabungan + progres menuju target nabung (frontend)

#### Added
- Kartu "Pengeluaran (bulan ini)" di Ringkasan kini menampilkan **Ditabung
  bulan ini** (nominal kategori "Nabung" bulan berjalan, dari data summary yang
  sudah dimuat) serta **Progres nabung** — bar persentase sederhana terhadap
  `targetNabung` saat target ditetapkan, untuk memantau sasaran menabung
  (mis. dana PC) sekilas.
- Fix a11y: watermark floating (RhoWatermark) memakai `text-[10px]` di bawah
  lantai keterbacaan 12px → diganti `text-xs` (menghijaukan scan typography).
- Tests: +2 komponen (SummaryView) — nilai Ditabung dirender dari
  `perKategori["Nabung"]`, dan bar progres muncul hanya saat target > 0.
  Full suite frontend hijau: 73 file, tsc -b, oxlint tanpa warning baru.

### P13 — Ringkasan: rincian pengeluaran per kategori di kartu Pengeluaran (frontend)

#### Added
- Kartu "Pengeluaran (bulan ini)" di Ringkasan kini menampilkan hingga 4 kategori
  belanja terbesar bulan ini (berdasarkan nominal), dikecualikan setoran
  "Nabung" agar konsisten dengan angka "Total bulan ini" (yang juga tidak
  menghitung nabung sebagai pengeluaran). Breakdown hanya dirender bila ada
  kategori belanja, jadi digest tetap tenang saat bulan kosong.
- Tests: +2 komponen (SummaryView) — breakdown per kategori dirender dari data
  summary, dan kategori "Nabung" tidak ikut tampil. Full suite hijau: frontend
  (tsc -b, oxlint tanpa warning baru).

### P12 — Jobs: endpoint ringkasan pipeline `GET /api/jobs/summary` (backend)

#### Added
- Endpoint baru `GET /api/jobs/summary` mengembalikan ringkasan pipeline
  lowongan: jumlah per status (`new`/`applied`/`interview`/`offer`/`closed`),
  total, dan ember urgensi follow-up relatif terhadap hari ini (WIB) —
  **terlambat** (sebelum hari ini), **hari ini**, dan **dalam 7 hari**.
  Dibangun satu query ringan (`Status` + `FollowUpTanggal` saja), mengikuti
  pola fungsi `TodayWib()` yang sama dengan `ExpensesController`.
- Tests: +3 — 2 unit test repository (SQLite in-memory: grup status + ember
  follow-up vs `today`, serta kasus kosong) dan 1 test controller (200 + bentuk
  `JobsSummary`). Full suite backend hijau: 714 pass, build 0 warning.

### P11 — Ringkasan: kartu Promo/Event bisa dialihkan ke view Events (frontend)

#### Added
- Kartu "Promo / Event" di Ringkasan kini punya tombol **Lihat semua promo** yang
  mengalihkan langsung ke view Events — pola yang sama dengan drill-down "Perlu
  follow-up" di kartu Lowongan. Tombol muncul hanya saat prop `onOpenEvents`
  disediakan; tanpa prop itu, kartu tetap dirender seperti semula (backward-
  compatible).
- Tests: +2 komponen (SummaryView) — tombol dirender dan memicu navigasi saat
  diklik, serta tidak muncul ketika `onOpenEvents` kosong. Full suite hijau:
  frontend (tsc -b, oxlint tanpa warning baru).

### P10 — Jobs: ekspor CSV menghormati semua filter aktif (backend + frontend)

#### Fixed
- CSV export di view Job Opportunities sebelumnya hanya menghormati filter status;
  filter **tipe**, **tier** (prioritas/standar), **kata kunci**, dan
  **Perlu follow-up** diabaikan sehingga hasil unduhan bisa menyimpang dari
  daftar yang tampil di layar. Sekarang `GET /api/jobs/export` menerima
  parameter `tipe`, `tier`, `q`, `followUpOnly` (dengan `today` WIB) dan
  menerapkan aturan filter yang sama dengan UI — file CSV selalu mencerminkan
  baris yang sedang dilihat, konsisten dengan perilaku ekspor pengeluaran dan
  event.
- Frontend `exportOpportunitiesCsv` kini menerima objek filter dan mengirim
  seluruh filter aktif saat mengekspor.
- Tests: backend +6 unit test (`JobsControllerExportTests`): tipe, tier,
  keyword lintas field, follow-up-only dengan today ekplisit, dan kombinasi
  semua filter. Full suite hijau: backend 711, frontend 73 file, tsc -b,
  oxlint (tanpa warning baru).

### P9 — Ringkasan: promo segera berakhir (frontend)

#### Added
- The Ringkasan "Promo / Event" card now surfaces promo urgency the same
  way the Lowongan card surfaces follow-ups: three counts — **Berakhir
  hari ini**, **Besok berakhir**, and **Dalam 7 hari** — bucketed from
  the existing `countdownLabel()`/`daysRemaining()` helpers in
  `eventsStatus.ts` against today (WIB). Rendered only when at least one
  promo is expiring within 7 days, so a quiet digest stays clean. This
  brings near-expiry promos onto the one-screen digest without opening
  the Events view.
- Tests: +2 component tests (SummaryView) covering the today/tomorrow/
  7-day buckets (expired and far-future events excluded) and the hidden
  path when nothing is expiring soon. Full suite green: frontend (16
  targeted), tsc -b, oxlint (no new warnings).


#### Added
- Promo event cards now show an emphasized countdown beside their "berlaku s/d"
  date: **N hari lagi** (multi-day), **besok berakhir**, or **berakhir hari ini**
  — so promos near expiry are visible at a glance without opening each promo.
  Computed from `berlakuSampai` against WIB today via new pure
  `countdownLabel()`/`daysRemaining()` in `eventsStatus.ts`; rendered only for
  active (incl. segera) events — expired ones keep their chip + dimming and
  show no countdown.
- Tests: +5 unit (`countdownLabel`/`daysRemaining`) and +2 component
  (EventsView) covering same-day/tomorrow/multi-day labels and the no-countdown
  path for expired promos. Full suite green: frontend (73 files), tsc -b.

### P7 — Dashboard: follow-up hari ini & 7 hari (frontend)

#### Added
- The Ringkasan "Lowongan" card now shows two more follow-up stats beside the
  existing overdue ("Perlu follow-up") count: **Follow-up hari ini** and
  **Dalam 7 hari** — the same urgency bucketing as the Jobs "Jadwal follow-up"
  panel, scoped to active pipeline stages (applied/interview/offer). This brings
  the next week's nudges onto the one-screen digest without opening the Jobs view.
- Tests: +1 component test (SummaryView) covering the today / 7-day split,
  boundary day, and active-stage-only counting.

### P6 — Jobs: panel "Jadwal follow-up" (frontend)

#### Added
- The Jobs view gains a "Jadwal follow-up" panel that lists every opportunity
  carrying a follow-up target date, bucketed by urgency: **Terlambat** (past
  date), **Hari ini**, **7 hari ke depan**, and **Berikutnya** (later), each
  sorted by date and with the pipeline status shown. It complements the existing
  "Perlu follow-up" filter (which only surfaces overdue) by also surfacing the
  upcoming follow-ups, so the next week's nudges are visible at a glance.
- Renders nothing when no follow-up is scheduled, so it is additive to the
  existing filter/list.
- Tests: +2 component tests (JobsView) covering bucket grouping and the empty
  case; existing overdue-follow-up filter tests re-scoped to the list via a
  `data-testid="jobs-list"` hook shared the new panel is a separate section.
  Full suite green: frontend (73 files), tsc -b, oxlint.
### P5 — Jobs: kurasi manual — tambah/edit/hapus lowongan (backend + frontend)

#### Added
- The Jobs view gains manual curation on top of the auto-imported list: a
  **Tambah** inline form (judul, perusahaan, lokasi, tipe, gaji, link, catatan,
  status awal, tanggal ditemukan) plus **Edit**/**Hapus** per card. Manual rows
  get a `web-…` SourceId prefix so the seeder's dedup never treats them as an
  auto-imported row.
- Backend: `POST /api/jobs`, `PUT /api/jobs/{id}` and `DELETE /api/jobs/{id}`
  (operator-only, API key required). New `IOpportunityRepository`
  `AddAsync`/`UpdateAsync`/`DeleteAsync`; `JobWriteRequest` DTO with validation
  (required judul/perusahaan/lokasi, known status, valid dates, skor 0–100).
- Frontend: `jobsApi` gains `createJob`/`updateJob`/`deleteJob` + `JobWritePayload`;
  `JobsView` renders the inline form (reusing the events-form interaction pattern)
  and reloads after each mutation.
- Tests: backend +7 unit (JobsControllerWriteTests) and +6 integration
  (JobsWriteIntegrationTests) — create/update/delete, validation, auth, 404s;
  frontend +4 component (JobsView) and +4 transport (jobsApi). Full suite green:
  backend 706, frontend (72 files), tsc -b, oxlint, a11y typography scan.



#### Added
- The Jobs view gains a toggle that narrows the list to opportunities whose
  scheduled follow-up date has passed (status applied/interview/offer, date <=
  today). It reuses the existing `needsFollowUp` rule, shows a live count on the
  button, combines with the status/type/tier/keyword filters, and the empty state
  names the follow-up filter when nothing matches. This turns the overdue
  follow-up badges into a one-click actionable queue — handy as the Dec 2026
  contract end nears.
- Tests: +4 component (JobsView) covering the count label, filtering to overdue
  only, toggling off to restore, and the empty-state message.

### P2 — Job pipeline keyword search (frontend)

#### Added
- The Jobs view gains a keyword search box that filters the curated opportunity
  list live by judul / perusahaan / lokasi / tipe / gaji / catatan
  (case-insensitive), scoped to the currently active status/type/tier filters.
  This complements the existing filter tabs and CSV export, so the pipeline is
  now findable by term without scrolling every group.
- Tests: +5 component (JobsView) covering title match, perusahaan/lokasi match,
  clearing the query restores the full list, combined with the status filter, and
  the empty-state message showing the query. Full suite green: frontend 72 files
  (1,173 tests), tsc -b, oxlint, a11y typography scan; backend 687 unchanged.

### P3 — Event & Promo: cari kata kunci (frontend)

#### Added
- The Events view gains a keyword search box that filters the curated promo list
  live by judul / aplikasi / benefit / syarat (case-insensitive), scoped to the
  currently selected platform tab. This complements the existing platform pills,
  so the daily auto-imported list is now findable by term without opening each
  platform.
- Tests: +5 component (EventsView) covering title match, benefit/syarat match,
  clearing the query restores the full list, combined platform+keyword filter,
  and the empty-state message showing the query. Full suite green: frontend
  72 files (1,173 tests), tsc -b, oxlint.



#### Added
- Events view now supports manual curation on top of the auto-imported list:
  a **Tambah** inline form (aplikasi, judul, benefit, syarat, link, berlaku
  s/d, tanggal ditemukan) plus **Edit**/**Hapus** per card.
- Backend: `POST /api/events`, `PUT /api/events/{id}` and
  `DELETE /api/events/{id}` (operator-only, API key required). Manual rows get a
  `web-…` SourceId prefix so the seeder's dedup never treats them as an
  auto-imported (platform|judul) row. New `IPromoEventRepository`
  `GetByIdAsync`/`AddAsync`/`UpdateAsync`/`DeleteAsync`.
- Frontend: `eventsApi` gains `createEvent`/`updateEvent`/`deleteEvent`;
  `EventsView` renders the inline form and reloads after each mutation.
- Tests: backend +10 unit (EventsControllerTests) and +4 integration
  (EventsWriteIntegrationTests) — create/update/delete, validation, auth,
  404s; frontend +6 component (EventsView) and +4 transport (eventsApi).
  Full suite green: backend 687, frontend (72 files), tsc -b, oxlint.


### Fix — Pengeluaran all-time summary: "Dari Gaji" card resolved total income (backend + frontend)

#### Fixed
- The all-time "Sisa Uang" grid card a card labeled "Dari Gaji" that displayed the same
  value as "Total Pemasukan" (total income across all sources) — misleading once any
  non-salary income exists. Removed the duplicate.
- Replaced it with a genuinely useful "Total Ditabung" stat: total savings
  (Nabung-category deposits) across all months, surfaced from a new `totalNabung`
  field on `GET /api/expenses/sisa`. Backend: new `IExpenseRepository.GetTotalNabungAsync`
  (sum of `Kategori == "Nabung"`); `ExpensesController.Sisa` now returns it. Frontend:
  `ExpenseSisa.totalNabung` + the `ExpensesView` card reads it. Also cleared two
  pre-existing CS8601 nullable-reference warnings in `Jobs/EventsControllerExportTests`.
- Tests: +1 backend integration test (`Sisa_withApiKey_returnsTotalsAndNabung`,
  backend suite 674 → 675, 0 warnings); updated the `ExpensesView` all-time sisa test.
  Full suite green: backend 675, frontend (72 files), tsc -b, oxlint.

### P3 — Ringkasan dashboard: Perlu follow-up count (frontend)

#### Added
- The Ringkasan Lowongan card now shows a "Perlu follow-up" row counting active
  opportunities (applied/interview/offer) whose scheduled follow-up date is overdue
  (same logic as the Jobs view), so the one-screen dashboard surfaces actionable
  job-hunting follow-ups without opening the full pipeline. Frontend tests:
  SummaryView 8 → 9 (new overdue-follow-up case).

### P2 — Job pipeline CSV export (backend + frontend)

#### Added
- `GET /api/jobs/export` returns the curated job-opportunity list as CSV
  (RFC 4180, UTF-8 with BOM), optionally filtered by pipeline status. Backend
  tests: new `JobsControllerExportTests` (4 cases — header/rows, status filter,
  RFC 4180 quote-escaping, follow-up date column); full backend suite green (670).
- The Job Opportunities view gains an **"Ekspor CSV"** button that downloads the
  current pipeline (respecting the active status filter) via the new
  `exportOpportunitiesCsv` in jobsApi. Frontend tests: +3 jobsApi transport,
  +2 component (download + failure alert); full suite green (1,150).


### P3 — Composer draft auto-save (frontend)

#### Added
- The composer draft is auto-saved to localStorage (`omnichat_composer_draft_v1`)
  as the user types and restored on the next app load, so a long in-progress
  message survives a reload or an accidental unmount. Sending (or clearing) the
  draft removes the stored entry. New `useComposerDraft` hook; App.tsx now
  sources the composer state from it. Frontend tests 733 → 738.


### P3 — Mobile per-conversation model switcher in the top bar (frontend)

#### Added
- The mobile top bar (`MobileTopBar`) now renders a compact inline model switcher
  next to the mode badge when a catalog and change handler are provided, giving
  phones the same per-conversation model switching the desktop `ChatHeader` has,
  without opening the sidebar drawer. Falls back to the static model label when
  the handler is absent; the guest variant never shows it. App.tsx wires the
  active-mode catalog and `handleModelChange` into the admin mobile bar so the
  switch persists per conversation. Frontend tests 585 → 590.

### P2 — Persisted message feedback (like/dislike) (backend + frontend)

#### Added
- `PUT /api/conversations/{id}/messages/{messageId}/feedback` stores a rating
  (`"up"` / `"down"` / `null` to clear) on one message of a conversation. Owner
  scoped and admin-only (guests get 404), stored on a new `Message.Feedback`
  EF column (migration `AddMessageFeedback`). Backend tests 477 → 490.
- The streaming endpoint now files the assistant reply *before* `[DONE]` and
  forwards the stored message id as a `messageId` SSE frame, so the client can
  rate the just-finished answer without a reload.
- MessageList like/dislike buttons persist via `setMessageFeedback` in admin
  sessions (optimistic, with rollback on failure); drafts and guests keep the
  local-only toggle; ratings already stored server-side are reflected on load.
  Frontend tests 483 → 492.

### P3 — Chill / night mode palette ("Mode Malam") (frontend)

#### Added
- Night/calm palette toggle in the sidebar: redefines the same `--color-chill-*`
  tokens under a `.night-mode` root class, so every surface (chat, sidebar,
  expenses, scrollbars, markdown) dims together without touching any component.
  The choice is persisted in localStorage via `useSettings` (`nightMode`) and
  restored on reload. All swatches verified to meet WCAG AA against the night
  background (text 14.5:1, muted 7.7:1, accent 8.8:1, on-accent 7.7:1,
  red 6.1:1). Backed by a source-level palette guard (`night-palette.test.ts`).
- Sidebar row with a moon glyph and `aria-label="Mode malam"`; keyboard
  accessible and a 44px tap target inside its label. Frontend tests 423 → 431.

### P2 — Pin conversations in the sidebar (frontend)

#### Added
- Sidebar pin toggle on server-backed conversation rows (`Sematkan` / `Lepas
  sematan`): calls `PUT /api/conversations/{id}/pin`, reflects `aria-pressed`
  and a filled pin glyph when pinned, and re-sorts pinned rows above unpinned
  ones (mirroring the API's pinned-first ordering). `historyApi` gained
  `pinConversation`; `useServerHistory` gained `pinSession` and carries
  `isPinned` through the list rows. Frontend tests 340 → 352.

### P2 — Conversation content search (backend + frontend)

#### Added
- `GET /api/conversations?search=<term>` filters the conversation list to rows
  whose title or a contained message matches the term (blank/filtered term
  returns everything). Repository `ListConversationsAsync` gained a `search`
  parameter; ownership scoping and pinned-then-recency ordering are unchanged.
- Sidebar history search box (44px min tap target, `type=search`, `Cari
  percakapan…` placeholder, empty-state message on no matches), wired from App
  through `useServerHistory` to `listConversations`, with URL-encoding and
  no-op for blank terms. Frontend tests 333 → 340; backend 418 → 422.

### P2 — Pengeluaran trend endpoint (backend slice)

#### Added
- `GET /api/expenses/trend?months=6` returns chronological monthly spend totals
  over the last N months (1–24, default 6), zero-filled for empty months — the
  backend aggregation the pixel trend chart will consume.
- `IExpenseRepository.GetMonthlyTrendAsync` + `ExpenseRepository` implementation
  (grouped by month, ordered oldest → newest, missing months zero-filled).

### Milestone 24 — nginx frontend proxy fix + non-root hardening

#### Fixed
- **Critical**: `frontend/nginx.conf` had no `/api` proxy location — API calls from
  the Docker frontend returned 404 (nginx served `index.html` instead of proxying
  to the backend). Added `location /api/` with `proxy_pass http://backend:5184`,
  SSE support (`proxy_buffering off`, `proxy_read_timeout 86400s`), and standard
  forwarded headers.
- **Frontend Dockerfile** now runs nginx as non-root (`USER nginx`): pre-creates
  and chowns cache/temp dirs, redirects PID path to `/tmp`, removes the `user`
  directive — no CAP_CHOWN needed.
- Re-enabled `cap_drop: ALL` + `no-new-privileges: true` on the frontend
  docker-compose service (removed in a prior fix that was needed for root nginx
  but is unnecessary with the non-root setup).
- Removed stale `VITE_API_PROXY_TARGET` from docker-compose frontend environment
  (nginx handles `/api` proxying; the env var was for vite preview, no longer used).

#### Changed
- `.env.example`: `VITE_API_PROXY_TARGET` documented as local-dev-only.
- `docs/deployment.md`: updated all references from "vite preview" to nginx;
  added `RateLimit__*` env vars to the table; updated non-root execution and
  healthcheck descriptions.
- `README.md`: Docker section now notes nginx serves static files + proxies `/api`.
- Added Milestone 24 to the milestones list.

#### Tests
- 7 new deployment config tests: nginx `/api` proxy, SSE proxy support, listen port,
  SPA fallback, non-root cache dirs, PID path fix, `VITE_API_PROXY_TARGET` removal.
- Updated 3 existing tests to match the nginx-based frontend (USER nginx, chown,
  wget healthcheck).
- 243 backend tests total, 0 warnings.

## [Unreleased]

### Added
- **Milestone 23** — Configurable rate limiting: the per-IP token-bucket rate
  limiter (previously hardcoded to 10 req/min) is now configurable via two
  environment variables: `RateLimit__TokenLimit` (default: 10) and
  `RateLimit__ReplenishmentPeriodSeconds` (default: 60). Added `RateLimitOptions`
  class in `Infrastructure/Networking/`; wired into `Program.cs` so both the
  `chatPolicy` token-bucket limiter and the per-IP partition read the configured
  values. `.env.example`, `docker-compose.yml`, `appsettings.json`, and the
  README environment-variables table document the new settings. Backward
  compatible: existing deployments without the new env vars use the same
  10 req/min defaults. 9 new tests (4 unit, 1 integration with custom config,
  4 deployment-config guards). 236 backend tests + 23 frontend tests, 0 warnings.
- **Milestone 22** — Frontend component testing: added Vitest + @testing-library/react
  + @testing-library/jest-dom + jsdom to the frontend devDependencies; 23 component
  tests covering rendering (title, subtitle, mode toggle, model selector, API key
  input), model catalog fetching (on mount, with X-Api-Key header, fallback to
  built-in defaults on fetch failure/rejection, custom models from response),
  mode toggle (switches between Agent/Direct, updates model selector), API key
  persistence (localStorage set/remove, lock/unlock emoji indicator), send/stop
  button interactions (disabled when empty, enabled on input, clears after send,
  shows user message, shows stop button while streaming), and clear chat.
  `vite.config.ts` gains `test` config (jsdom environment, globals, setupFiles);
  `tsconfig.app.json` excludes test files from production build typecheck;
  `tsconfig.test.json` provides IDE type support (not referenced by `tsc -b`);
  CI workflow runs `npm run test` between lint and build. 223 backend tests +
  23 frontend tests, 0 warnings, frontend builds, CI green.
- **Milestone 21** — README documentation consolidation: merged the two
  overlapping API sections ("## API Reference" + "## API" + "## Error Responses")
  into a single structured section; fixed the health-check response example to
  match the actual `HealthResponseWriter` output (`uptimeSeconds` integer, not
  `uptime` string); added M20 to the README milestones list; standardised curl
  placeholder text. 4 new deployment-config guard tests (single API section,
  health example format, milestones list includes M20, OpenAPI subsection
  preserved). 223 tests, 0 warnings.
- **Milestone 20** — Non-root container hardening + API reference:
  - Backend Dockerfile runs as `app` (UID 101, built into aspnet:10.0); frontend
    runs as `node` (UID 1000, built into node:22-alpine). Both use `--chown` on
    COPY so files are readable after the USER switch.
  - `docker-compose.yml`: `security_opt: ["no-new-privileges:true"]` +
    `cap_drop: ["ALL"]` on both services — prevents privilege escalation and drops
    all Linux capabilities.
  - README gains a structured API Reference section (endpoint table, curl
    examples, request/response schemas, SSE event format, RFC 7807 error table,
    validation constraints) — 219 tests
- **Milestone 19** — OpenAPI document enrichment: `/openapi/v1.json` now carries
  title ("OmniChat API"), description, version, contact, and MIT license metadata
  via `IOpenApiDocumentTransformer`. `StreamChat` declares `401 Unauthorized` in
  its OpenAPI response types. Added `CHANGELOG.md` for portfolio readability.

## [1.0.0] — 2026-10-11

### Milestone 1 — Core SSE Streaming
- Clean Architecture backend (Domain / Application / Infrastructure / Controllers)
- `POST /api/chat/stream` SSE endpoint with `data: {"content":"..."}` events
- Hermes Bridge mode (forwards to Hermes Agent Gateway) + Direct LLM mode (OpenRouter)
- `Channel<T>` producer pattern for async streaming (yield cannot be in try/catch)
- Fallback simulation mode when no LLM key is configured
- React + TypeScript + Vite + Tailwind v4 frontend with markdown rendering (GFM)

### Milestone 2 — Quality & Testing
- xUnit + Moq test suite (33 tests, 0 warnings)
- `TestableHttpMessageHandler` for HttpClient mocking
- Frontend polish: auto-scroll, stop button, streaming indicator, model selector
- `appsettings.Development.json` force-added (localhost endpoints, no secrets)

### Milestone 3 — Production Readiness
- Multi-stage Dockerfile + frontend Dockerfile + docker-compose orchestration
- Environment-based config (`appsettings.Development.json` / `appsettings.Production.json`)
- Rate limiting (token bucket, 10 req/min per IP, returns 429)
- Integration tests via `WebApplicationFactory<Program>`
- OpenAPI metadata, deployment guide, API-key auth middleware
- CORS per-environment, correlation ID middleware
- CI/CD pipeline (GitHub Actions — backend build+test + frontend lint+build)

### Milestone 4 — Security & Observability
- API-key authentication (constant-time compare, exempts `/health`)
- Correlation ID middleware (`X-Correlation-Id` header + logging scope)
- Configurable CORS policy

### Milestone 5 — Observability Hardening
- `RequestLoggingMiddleware` (method, path, status, duration, correlation id)
- Enriched JSON `/health` endpoint (status, version, uptime via `ServiceStartTime`)
- Rate-limit integration test (429 after 10 tokens) — 46 tests

### Milestone 6 — JWT Authentication
- JWT bearer auth (HMAC-SHA256, validates signature/issuer/audience/lifetime)
- Dual-auth with API key (`JwtAuthenticationMiddleware` + `ApiKeyMiddleware`)
- `JwtTokenValidator` with `MapInboundClaims=false` (claim names kept verbatim)
- Inert until `Security:Jwt:SigningKey` is set — 67 tests

### Milestone 7 — Dynamic Model Catalog
- `GET /api/models` returns `{agent:[...], direct:[...]}` from config
- `ModelCatalogService` bound to `Models` config section with built-in defaults
- Frontend fetches `/api/models` at boot with local fallback — 72 tests

### Milestone 8 — Deployment Config Correctness
- `docker-compose.yml`: `Hermes__Endpoint` → `http://host.docker.internal:5000/v1/chat/completions`
- `extra_hosts: ["host.docker.internal:host-gateway"]` on backend
- `frontend/vite.config.ts`: `preview.proxy` (serves via `vite preview` in Docker)
- `Program.cs`: `UseHttpsRedirection()` only outside Production (nginx terminates TLS)
- Blank CORS origins filtered (empty env value falls back safely)
- `.env.example` (tracked) + deployment guide `.env` workflow — 76 tests

### Milestone 9 — Container & Deployment Hardening
- Runtime image installs `curl` (aspnet image doesn't bundle it — dotnet-docker#2379)
- Dockerfile `HEALTHCHECK` + root `.dockerignore` (no secrets/artifacts in build context)
- Frontend runtime uses `npm ci` from `package-lock.json` (pinned, reproducible)
- Deployment-config regression guards — 80 tests

### Milestone 10 — Security Headers
- `SecurityHeadersMiddleware`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies: none`
- Kestrel `Server` header suppressed (`AddServerHeader = false`)
- README env-var reference table — 90 tests

### Milestone 11 — Startup Validation & Request Safety
- `StartupConfigValidator`: warns in Production for empty API key, CORS origins, JWT signing key
- Kestrel `MaxRequestBodySize` configurable (default 10 MB, DoS prevention)
- JWT issuer/audience env vars documented and forwarded — 105 tests

### Milestone 12 — Input Validation & Production Hardening
- `ChatRequest`: model max 100 chars, messages max 50 items
- `ChatMessage`: role whitelist `[user|assistant|system]`, content max 8000 chars
- Graceful shutdown (30s timeout for in-flight SSE streams)
- Docker Compose memory limits (backend 512 MB, frontend 256 MB) — 126 tests

### Milestone 13 — Frontend Auth & JSON Logging
- Sidebar API key input (localStorage, `X-Api-Key` header on every request)
- Auto-refresh model catalog on key change
- `appsettings.Production.json` JSON console formatter (ELK/Loki compatible)
- Integration tests for `/api/models` auth (401 without key, 200 with key) — 128 tests

### Milestone 14 — API Response Quality
- Rate-limit `OnRejected`: `Retry-After` header + ProblemDetails JSON body on 429
- Response compression (Brotli + Gzip for JSON; SSE excluded)
- `Cache-Control: public, max-age=60` on `/api/models`
- Frontend reads `Retry-After` and shows retry countdown — 137 tests

### Milestone 15 — RFC 7807 ProblemDetails
- All error responses (400, 401, 429, 500) use `application/problem+json`
- Consistent `{ title, status, detail, instance, traceId }` schema
- `AddProblemDetails()` + custom `InvalidModelStateResponseFactory`
- `ProblemDetailsJson` helper (camelCase serialization) — 150 tests

### Milestone 16 — Reverse-Proxy Forwarded Headers
- `ForwardedHeadersSetup` + `ReverseProxyOptions` (`ReverseProxy:*` config section)
- `UseForwardedHeaders` (`X-Forwarded-For`/`X-Forwarded-Proto`) — real client IP behind nginx/Caddy
- Opt-in (`Enabled=false` default), trust additive (loopback defaults preserved)
- CIDR parsing via `System.Net.IPNetwork` — 184 tests

### Milestone 17 — Model-Catalog Configurability
- `ModelCatalogService` accepts single JSON-array env var (`Models__Agent`/`Models__Direct`)
- Malformed JSON logged and falls back to defaults
- Docker-compose forwards catalog vars; frontend node-based readiness healthcheck — 189 tests

### Milestone 18 — SSE Error Sanitization & Project Metadata
- `ChatController.StreamChat` catch block sends generic error event (not `ex.Message`)
- `ChatService.ProduceTokensAsync` upstream-error message sanitized (no HTTP status code)
- Frontend `App.tsx` handles `parsed.error` in SSE events and displays them
- MIT `LICENSE` file added; CI workflow: NuGet cache + frontend `npm run lint` — 200 tests

---

## License

MIT License — see [LICENSE](LICENSE).
