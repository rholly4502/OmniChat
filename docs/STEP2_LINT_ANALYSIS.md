# Step 2 — Fondasi Linter Terpusat (OmniChat)

Status: **build sukses, 0 error** (dengan `--no-incremental`, AnalysisLevel=latest-recommended).

## Yang diubah

### `.editorconfig` (root)
- Dinaikkan jadi **error**: kategori **Security** & **Reliability** (`dotnet_analyzer_diagnostic.category-Security`, `category-Reliability`)
- Dimatikan (**none**) karena noise untuk aplikasi ASP.NET Core (bukan library):
  - `CA2007` (ConfigureAwait) — tidak relevan di kode app/web
  - `CA1515` (tipe publik → internal) — akan memecah DI
  - `CA1062` (validasi null param framework) — sudah ditangani runtime
- `[tests/**/*.cs]` tetap mengecualikan DL100/DL101 + Security/Reliability (fixture & mock tidak punya konteks produksi)

### `Directory.Build.props`
- `<Nullable>enable</Nullable>`
- `<EnableNETAnalyzers>true</EnableNETAnalyzers>`
- `<AnalysisLevel>latest-recommended</AnalysisLevel>` (bisa di-override ke latest-all + triage via .editorconfig)
- `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>`
- NuGet analyzer baru: **SonarAnalyzer.CSharp 10.36.0.15337** + **AsyncFixer 2.1.0** (keduanya `PrivateAssets="all"`)
- Analzer master DL100/DL101 tetap via ProjectReference `/root/lint-rules`

## Hasil scan (sisa warning, setelah triage)

Total: **167 warning** (0 error). Perangkat:

| Kode | Jumlah | Sumber | Isu |
|------|--------|--------|-----|
| CA1305 | 37 | NET | `DateOnly/int.ToString` tanpa `IFormatProvider` (rentan locale) |
| CA1848 | 27 | NET | Logging sebaiknya pakai `LoggerMessage` delegates |
| S6580 | 22 | Sonar | Parse date/time tanpa format provider |
| CA1862 | 10 | NET | Bandingkan string tanpa `StringComparison` eksplisit |
| CA1716 | 7 | NET | Nama anggota mirip keyword bawaan |
| S1144 | 6 | Sonar | Anggota private tak terpakai |
| S6964 | 6 | Sonar | Property value-type di controller action perlu nullable/required |
| S8969 | 5 | Sonar | Null-forgiving operator redundan |
| S3358 | 5 | Sonar | Nested ternary |
| lainnya | ~42 | campuran | S6966, S6667, CA1861, S6960, S1075, S108, S5122, dll |

Komposisi sumber: **NET analyzers (CA*) ≈ 90**, **SonarAnalyzer (S*) ≈ 67**, lainnya 3 (RS2008/CS8600 dari project analyzer lint sendiri).

## Catatan
- `CA1305` & `S6580` adalah pasangan serupa (localization) — kandidat teratas untuk diperbaiki berikutnya.
- Security & Reliability awalnya dinaikkan jadi error, tapi tidak ada temuan kategori itu yang muncul pada build ini (tidak ada error).
- File ini bagian dari laporan baseline; perbaikan warning bukan bagian dari Step 2 ini.
