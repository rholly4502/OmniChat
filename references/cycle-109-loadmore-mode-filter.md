# Cycle 109 — loadMore mode-filter fix (2026-11-11)

**Commit `eda4f6c`**, CI hijau, Deploy SSH gagal (outage transport VPS yang sudah ada, lihat cycle 106/107 — bukan karena commit ini).

## Bug
`useServerHistory`'s `loadMore` (paginasi sidebar) membangun ulang filter list dari closure
dan **menjatuhkan filter `mode`**. Fetch list awal mengirim `{ model, mode, from, to }`,
tapi `loadMore` hanya mengirim `{ model, from, to }`. Akibatnya: saat pengguna memfilter
histori berdasarkan mode (agent/direct) lalu memuat halaman berikutnya, halaman yang
di-append bercampur dengan percakapan dari mode lain.

## Fix
Destructure `modeFilter` dalam `loadMore` dan teruskan ke `list()` bersama filter lain —
paritas penuh dengan fetch list awal.

## Test regresi
`useServerHistory.test.tsx`: test baru "loadMore carries the active model and mode filters
onto the next page" memastikan `list()` dipanggil dengan `{ model, mode, from, to }` yang
sama pada halaman pertama dan kedua.

## Pitfall — secret scanner menutupi `apiKey`
Output terminal menutupi token `apiKey: apiKey` sebagai `apiKey: ***`. Ketika menulis
`new_string` patch, jangan salin teks yang dimask dari output — verifikasi byte-aktual
(`python3 -c "print(repr(open('f').read()))"` atau `grep -c '***'`) ` tulis ulang dengan
heredoc/python bila perlu. (Kasus ini: `***` literal nyaris masuk ke file; `grep -c '***'`
→ 0 setelah koreksi.)

## Verifikasi
- Frontend `npm test` → **1025 passed** (sebelumnya 1024; +1 test regresi)
- `npm run lint` → bersih; `npm run build` → sukses
- Backend `dotnet test` → **624/624 passed** (tanpa perubahan backend)
- Deploy: step `Deploy via SSH` gagal sama seperti 2 commit sebelumnya — outage SSH VPS
  yang sudah tercatat (cycle 106/107). Featured live setelah SSH pulih.
