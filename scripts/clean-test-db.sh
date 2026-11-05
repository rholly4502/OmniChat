#!/usr/bin/env bash
# Bersihkan SQLite DB test (termasuk lock __EFMigrationsLock basi) sebelum dotnet test.
# Akar hang: run yang dibunuh (timeout/kill) meninggalkan baris lock basi
# di __EFMigrationsLock -> MigrateAsync seterusnya (livelock).
# Hapus file DB test -> dibuat ulang bersih saat run berikutnya.
set -u
for pat in \
  "tests/OmniChat.Tests/bin/Release/net10.0/omnichat.db" \
  "tests/OmniChat.Tests/bin/Debug/net10.0/omnichat.db"; do
  rm -f "$pat" "$pat-journal" "$pat-wal" "$pat-shm"
done
echo "clean-test-db: sisa lock/DB test dibersihkan"
