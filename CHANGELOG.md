# Changelog

All notable changes to OmniChat are documented here.
The project follows [Keep a Changelog](https://keepachangelog.com/) conventions.

## [Unreleased]
### P40 — UI: pertahankan filter "Perlu follow-up" di view Lowongan (frontend)

#### Added
- Toggle **Perlu follow-up** pada view Lowongan kini bertahan di `localStorage`
  (`jobs.followUpOnly`) dan pulih saat reload — menutup satu-satunya kontrol
  filter view Lowongan yang belum ter-persist, sehingga pola persistensi P34/P35/
  P38/P39 kini seragam di keempat view data (Lowongan/Event/Pengeluaran).
- Tests: `JobsView.test.tsx` +1 (toggle tersimpan & pulih setelah remount).
  Frontend vitest ~1305 hijau; `tsc -b` & oxlint bersih.

### P39 — UI: pertahankan toggle "Semua Waktu" di view Pengeluaran (frontend)

#### Added
- Toggle rentang waktu **Semua Waktu** (vs **Bulan Ini**) pada ringkasan Sisa
  Uang kini bertahan di `localStorage` (`expenses.allTime`) dan pulih saat
  reload/sesuai — menutup satu-satunya kontrol scope-view Pengeluaran yang
  belum ter-persist, sehingga pola persistensi P34/P35/P38 kini seragam di
  ketiga view data.
- Tests: `ExpensesView.test.tsx` +1 (toggle tersimpan & pulih setelah remount).
  Frontend vitest 50 hijau; `tsc -b` & oxlint bersih.

### P38 — UI: persist filter aplikasi pada view Events (frontend)

#### Added
- Filter platform/aplikasi (`appFilter`) kini bertahan di `localStorage`
  (`events.appFilter`) dan pulih saat reload — selaras dengan persistensi
  pencarian & toggle `hideExpired`/`hideUsed` yang sudah ada (P34/P35),
  sehingga tidak ada lagi bagian state view Events yang hilang saat reload.
- Tests: `useEvents.test.tsx` +1 (filter tersimpan & pulih setelah remount).
  Frontend vitest 1303 hijau; `tsc -b` & oxlint bersih.

### P37 — Events: ekspor CSV/PDF hormati filter "Sembunyikan yang sudah dipakai" (backend + frontend)

#### Added
- Endpoint `GET /api/events/export` kini menerima parameter `hideUsed=true` dan
  menghapus promo yang sudah dipakai/diklaim dari hasil CSV maupun PDF — selaras
  dengan toggle di UI Events yang sebelumnya hanya memengaruhi tampilan layar.
- Frontend: `exportEventsCsv`/`exportEventsPdf` meneruskan `hideUsed`; tombol
  ekspor di `EventsView` kini menghasilkan baris persis yang terlihat di layar
  (mengikuti toggle "Sembunyikan yang sudah dipakai").
- Tests: `EventsControllerExportTests` +2 (sembunyikan/simpan yang dipakai),
  `EventsView.test.tsx` +2 (CSV & PDF meneruskan `hideUsed`). Backend 780 hijau,
  frontend vitest 183 hijau.


### P36 — Laporan bulanan: PDF sertakan ringkasan anggaran & nabung (backend)

#### Added
- `GET /api/expenses/export/pdf` kini mencetak blok "Ringkasan bulan" di atas
  tabel transaksi — anggaran, sisa anggaran, target nabung, ditabung bulan ini,
  dan dana PC terkumpul (kumulatif). Bulan tanpa target melewati baris yang null,
  sehingga laporan tetap rapi. Laporan cetak kini mengikat transaksi ke anggaran
  bulan itu dan ke dana goal part PC.
- Tests: `ExpensePdfReportTests` +2 (blok ringkasan tampil dengan nilai terformat;
  field null dihilangkan). Backend 778 hijau.

### P35 — UI: persistensi state pencarian & bulan yang konsisten (frontend)

#### Added
- Lengkapi pola persistensi P32/P34 secara seragam di ketiga view utama:
  - Lowongan: teks pencarian (`Cari lowongan…`) kini bertahan di `localStorage`
    (`jobs.query`) dan pulih saat reload — selaras dengan filter status/tipe/tier.
  - Event: teks pencarian (`Cari promo…`) kini bertahan (`events.query`) dan pulih.
  - Pengeluaran: bulan aktif di month-picker kini bertahan (`expenses.month`) dan
    pulih, sehingga review bulan sebelumnya tidak hilang saat reload. Ringkasan
    tetap selalu menampilkan bulan berjalan (pakai `useExpenses(apiKey)` tanpa
    `initialMonth`).
- Tests: `JobsView.test.tsx` +1, `EventsView.test.tsx` +1 (pencarian ter-persist &
  pulih setelah remount), `ExpensesView.test.tsx` +1 (bulan ter-persist & pulih);
  tsc -b, oxlint, vitest 183 hijau.

### P34 — UI: simpan filter Cari & kategori Pengeluaran (frontend)

#### Added
- Pencarian teks (`Cari transaksi…`) dan filter kategori di view Pengeluaran kini
  bertahan di `localStorage` (`expenses.query`, `expenses.categoryFilter`) dan pulih
  saat reload — selaras dengan persistensi filter Lowongan/Event (P32).
- Tests: `ExpensesView.test.tsx` +1 (query + kategori ter-persist dan pulih setelah
  remount); tsc -b, oxlint, vitest ExpensesView/App/Summary/Events/Jobs hijau.

### P33 — Events: ekspor CSV/PDF sertakan status dipakai (backend)

#### Added
- Ekspor event kini membawa kolom `dipakai` (`true`/`false`) — menandai promo yang
  sudah dipakai/diklaim, sehingga arsip eksternal mencerminkan status klaim di UI.
- Laporan PDF `EventsPdfReport` menampilkan kolom baru "Dipakai" (`Ya` untuk yang
  sudah dipakai) di samping kolom Status; posisi kolom digeser agar muat.
- Tests: `EventsControllerExportTests` +1 (CSV berisi kolom `dipakai`),
  `EventsPdfReportTests` +1 (PDF menyematkan kolom Dipakai). Backend 776 hijau.

### P32 — UI: simpan filter & urutkan Lowongan/Event (frontend)

#### Added
- Preferensi UI kini bertahan di `localStorage` dan pulih saat reload:
  - Lowongan: filter status pipeline, filter tipe, filter tier, dan urutkan
    (`jobs.statusFilter`, `jobs.typeFilter`, `jobs.tierFilter`, `jobs.sortBy`).
  - Event: toggle "Sembunyikan kedaluwarsa" dan "Sembunyikan dipakai"
    (`events.hideExpired`, `events.hideUsed`).
- Hook baru `usePersistedState` (mirip `useState` + persistensi JSON, mendukung
  updater fungsional) + test unit. `test-setup.ts` membersihkan localStorage
  antar-test agar tidak bocor.
- Tests: `usePersistedState.test.tsx` +6; tsc -b, oxlint, vitest
  JobsView/EventsView/useJobs/useEvents/SummaryView/a11y hijau.

### P31 — Jobs: tanggal tahap pipeline di ekspor CSV & PDF (backend)

#### Added
- `GET /api/jobs/export` (CSV) kini mengembalikan kolom `dilamarPada`,
  `interviewPada`, `tawaranPada` di samping `followUpTanggal`, sehingga riwayat
  tanggal tiap tahap (Dilamar/Interview/Tawaran) ikut tercatat dalam ekspor.
- Laporan PDF `JobsPdfReport` menampilkan baris riwayat tanggal tahap di bawah
  tiap lowongan yang memiliki setidaknya satu tanggal tahap (format "Dilamar
  YYYY-MM-DD · Interview … · Tawaran …"); paginasi per-baris menjaga baris
  tetap utuh agar tidak terpotong antar halaman.
- Tests: `JobsControllerExportTests` +1 (CSV berisi tanggal tahap),
  `JobsPdfReportTests` +1 (PDF menyematkan tanggal tahap). Backend 774 hijau.

### P30 — Jobs: top cocok (skor tertinggi) di Ringkasan (backend + frontend)

#### Added
- Backend `GET /api/jobs/summary` kini mengembalikan `topCocok` — 3 lowongan
  aktif (non-closed) dengan `skor` tertinggi, diurutkan menurun (imbang diputus
  oleh yang lebih baru ditemukan). `JobsSummary` diperluas field `TopCocok`
  (record `TopOpportunity`: id, judul, perusahaan, skor).
- `OpportunityRepositorySummaryTests`: +2 — top matches memilih skored aktif
  dan mengeluarkan closed/unscored, serta kosong saat semua closed/unscored.
  `JobsControllerSummaryTests` diverifikasi field baru.
- Frontend: kartu Lowongan Ringkasan menampilkan daftar "Top cocok" (judul ·
  perusahaan, skor) saat ada lowongan aktif yang diskor; disembunyikan bila
  kosong. Interface `JobsSummary` diperluas `topCocok`.
- Tests frontend: +2 SummaryView (render daftar top cocok; sembunyikan saat
  kosong). Backend 768, tsc -b, vitest SummaryView 33 + a11y, oxlint hijau.

### P29 — Jobs: alur pipeline (funnel) di Ringkasan (frontend)

#### Added
- Kartu Lowongan di Ringkasan kini menampilkan bar alur pipeline horizontal yang
  menampilkan proporsi tahap aktif (Baru → Dilamar → Interview → Tawaran)
  terhadap total lowongan yang masih aktif (closed tidak ikut). Legend per tahap
  ditampilkan di bawah bar dengan jumlah masing-masing. Bar disembunyikan saat
  tidak ada lowongan aktif.
- Tests frontend: +2 SummaryView (render funnel + legend per tahap; sembunyikan
  saat nol aktif). tsc -b hijau, vitest SummaryView 34 + a11y 5 hijau.

### P28 — Events: sisa promo aktif & sudah dipakai di Ringkasan (backend + frontend)

#### Added
- Backend `GET /api/events/summary` kini mengembalikan `totalDipakai` (jumlah promo
  yang ditandai sudah dipakai) dan `sisaAktif` (promo masih berlaku dan belum
  dipakai) — keduanya dihitung di `PromoEventRepository.EventsSummaryAsync` dengan
  memuat kolom `Dipakai`. `EventsSummary` diperluas dua field baru.
- `PromoEventRepositorySummaryTests`: asersi `totalDipakai` & `sisaAktif`
  (termasuk kasus promo aktif-tapi-dipakai tidak ikut terhitung sebagai sisa).
  `EventsControllerSummaryTests` diverifikasi field baru.
- Frontend: kartu Promo/Event Ringkasan menampilkan baris "Masih aktif tersedia"
  (sisaAktif) dan — bila ada — "Sudah dipakai" (totalDipakai). Interface
  `EventsSummary` diperluas dua field baru.
- Tests frontend: +2 SummaryView (render sisa & dipakai; sembunyikan baris
  dipakai saat nol). Full suite hijau: backend 766, tsc -b, vitest SummaryView,
  oxlint tanpa warning.


#### Added
- Backend `PATCH /api/events/{id}/dipakai` — toggle `dipakai` (sudah dipakai /
  terklaim) pada satu promo event, body `{ dipakai: bool }` → 204, 400 saat
  body invalid (default record), 404 saat id tidak ada. Kolom `Dipakai`
  (bool, default false) di entity `PromoEvent` + migrasi EF
  `AddPromoEventDipakai`.
- `EventsControllerDipakaiTests`: +3 — set true persist, set false clear,
  id tak dikenal → 404.
- Frontend: tombol toggle per kartu event — "Tandai sudah dipakai" /
  "Batal pakai" (aria-pressed, nonaktif saat sedang diproses), plus filter
  "Sembunyikan yang sudah dipakai" di panel Filter (pola sama persis dengan
  follow-up di Jobs). `updateEventDipakai()` di eventsApi + `updateDipakai`/
  `updatingId` di useEvents.
- Tests frontend: +3 useEvents (PATCH benar + update state lokal, error
  lokal), +4 EventsView (toggle mark, unmark, filter sembunyikan, nonaktif
  saat memproses). Full suite hijau: backend 766, tsc -b, vitest event 80 +
  a11y 5, oxlint tanpa warning.
### P26 — Jobs: urutkan daftar lowongan per grup (frontend)

#### Added
- Kontrol "Urutkan" di panel Alat & Filter JobsView — mengubah urutan kartu di dalam tiap grup (tipe lowongan): Skor cocok (tertinggi dulu, tanpa skor di belakang), Follow-up paling dekat (yang terjadwal dulu, tanpa tanggal di belakang), atau Perusahaan A–Z. Default tetap urutan bawaan (prioritas tier).
- Tests frontend: +4 JobsView (urutan default stabil, sort skor, sort perusahaan, sort follow-up). tsc -b + oxlint hijau, a11y lint lulus.
### P25 — Jobs: tandai follow-up selesai langsung dari panel Jadwal (frontend)

#### Added
- Tombol "Selesai" per baris di panel Jadwal follow-up — sekali klik langsung
  menghapus tanggal follow-up (`updateFollowUp(id, null)`) sehingga baris itu
  keluar dari jadwal tanpa perlu membuka kartu lowongan. Nonaktif saat baris
  sedang diproses; tidak muncul efek tanpa API key.
- Tests frontend: +4 JobsView (render tombol, klik memanggil updateFollowUp
  dengan null, state nonaktif saat memproses, tanpa API key tidak memanggil).
- Full suite hijau: backend 763, tsc -b, vitest JobsView 46 + a11y 5,
  oxlint tanpa warning.

### P24 — Expenses: rata-rata harian & proyeksi akhir bulan di Ringkasan (backend + frontend)

#### Added
- Backend `GET /api/expenses/summary` (bulan WIB berjalan) kini mengembalikan
  `hariBulanIni`, `hariBerjalan`, `rata2Harian` (total ÷ hari berjalan), dan
  `proyeksiAkhirBulan` (tarif harian × jumlah hari dalam bulan). Untuk bulan
  selain bulan WIB berjalan keempat field bernilai `null` — tidak ada proyeksi
  yang bermakna untuk bulan yang sudah lewat.
- `ExpensesControllerTests`: +2 — proyeksi di bulan berjalan (rata-rata harian
  & proyeksi akhir bulan dihitung benar), dan bulan lampau mengembalikan null.
- Frontend: baris "Rata-rata harian" dan "Proyeksi akhir bulan" di kartu
  Pengeluaran Ringkasan (locale id-ID), muncul hanya jika summary menyediakan
  proyeksi. `ExpenseSummary.rata2Harian` / `.proyeksiAkhirBulan` (opsional).
- Tests frontend: +2 SummaryView. Full suite hijau: backend 755, tsc -b,
  vitest SummaryView 27 hijau, oxlint tanpa warning.

### P23 — Expenses: dana nabung kumulatif di Ringkasan (backend + frontend)

#### Added
- Backend `GET /api/expenses/summary` kini mengembalikan `totalNabungKumulatif`
  — akumulasi seluruh setoran kategori "Nabung" sampai akhir bulan (dana
  mengendap menuju sasaran jangka panjang, mis. part PC), via
  `ExpenseRepository.GetCumulativeNabungAsync`. Berbeda dari `totalNabung`
  (`/sisa`) yang hanya hitungan bulan berjalan.
- `ExpensesControllerTests`: +2 — `totalNabungKumulatif` dalam summary, dan
  akumulasi lintas-bulan (setoran bulan sebelumnya ikut terhitung).
- Frontend: baris "Dana PC terkumpul" di kartu Pengeluaran Ringkasan menampilkan
  dana kumulatif (locale id-ID). `ExpenseSummary.totalNabungKumulatif` (opsional).
- Tests frontend: +1 SummaryView (render dana kumulatif). Full suite hijau:
  backend 753, tsc -b, vitest 48 file hijau, oxlint tanpa warning baru.


#### Added
- Backend `LamaranDraftService.BuildPrompt` — profil kandidat Rholly kini memuat
  kontak LinkedIn, sehingga draft surat lamaran hasil AI menyertakan akun untuk
  verifikasi rekruter. Selaras dengan penambahan LinkedIn di form paket lamaran
  frontend.
- `LamaranDraftServiceTests.Generate_SendsLinkedInInCandidateProfile` — memastikan
  prompt yang dikirim ke gateway memuat URL LinkedIn.
- Full suite backend hijau: 752 test.

### P21 — Jobs: ekspor PDF pipeline (backend + frontend)

#### Added
- Backend `GET /api/jobs/export?format=pdf` — render pipeline (setiap status
  yang sedang difilter, termasuk follow-up) sebagai PDF multi-halaman A4 lewat
  `JobsPdfReport` (writers bebas-dependensi, font base-14 Helvetica, pagination
  otomatis — tidak memangkas baris di halaman pertama). Kembali `application/pdf`
  dengan nama `jobs-<tanggal>.pdf`; tanpa `format=pdf` tetap menghasilkan CSV.
- `JobsPdfReportTests`: 5 unit test struktur PDF (header, objek, xref, trailer),
  pagination > 1 halaman tanpa truncasi (120 baris → 3 halaman, baris terakhir
  tetap ada), label status Indonesia, escape tanda kurung.
- `JobsControllerExportTests`: +3 — PDF file, filter diterapkan, fallback CSV.
- Frontend: `exportOpportunitiesPdf` (transport, `format=pdf` + seluruh filter
  aktif) dan tombol "Ekspor PDF" di JobsView di samping "Ekspor CSV".
- Tests frontend: +3 jobsApi + +2 JobsView (download & galat). Full suite hijau:
  backend 751, tsc -b, oxlint tanpa warning baru, build prod ok.

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
