# AGENTS.md — Instruksi agent untuk repo ini

Aturan di bawah adalah kontrak non-deterministik untuk setiap agent/editor AI yang bekerja di repo ini. Ringkas, krusial, tanpa redundansi dengan tooling yang sudah deterministik (analyzer, CI).

## Wajib Verifikasi (sebelum menyatakan selesai)
Sebelum menutup satu tugas, wajib jalankan `dotnet build` dan `dotnet test` sampai hijau:
- `dotnet test tests/OmniChat.Tests/OmniChat.Tests.csproj`
- `dotnet test tests/OmniChat.ArchitectureTests/OmniChat.ArchitectureTests.csproj`

Jika ada yang merah, perbaiki akar masalahnya dulu; jangan melaporkan selesai sebelum semua hijau.

## Larangan Bypass Linter
Dilarang keras menambahkan `#pragma warning disable`, `[SuppressMessage]`, atau menurunkan severity di `.editorconfig` demi membuat build hijau. Perbaiki akar masalahnya. Pengecualian hanya untuk kontrak framework (mis. middleware `InvokeAsync`) yang memang tidak bisa menyediakan `CancellationToken`, dan wajib disertai komentar alasan.

## Larangan Comment Slop
Jangan menulis komentar kode untuk membenarkan workaround atau quick fix. Kode yang benar tidak butuh pembenaran; jika butuh penjelasan, itu sinyal kodenya harus diperbaiki—bukan dikomentari.

## Pola Referensi (Golden Example)
Ikuti struktur fitur Expenses untuk fitur baru:
- Controller di `src/OmniChat.Api/Controllers/` (mis. `ExpensesController`)
- Interface di `src/OmniChat.Api/Application/Interfaces/`
- Implementasi di `src/OmniChat.Api/Infrastructure/`
- Integration test di `tests/OmniChat.Tests/Integration/` (WebApplicationFactory + SQLite asli)
