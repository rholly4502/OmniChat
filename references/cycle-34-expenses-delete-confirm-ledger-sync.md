# Cycle 34 — delete confirmation + ledger rollover sync (2026-11-01)

Two commits, both CI+Deploy green, live bundle hash matched:
- `b2f4a13` chore(expenses): sync ledger — stage 2026-11 month file, move Nov rows out of Oct CSV [P1-1]
- `1dab0a2` feat(expenses): two-step delete confirmation to prevent accidental row loss

## 1. Ledger sync (P1-1) — month-rollover drift

Tools-Private had rolled into a new `2026-11.csv`; the staging dir
`.github/seed-staging/ledger/` still (a) carried the two 2026-11-01 rows inside
`2026-10.csv` and (b) was missing `2026-11.csv` entirely. Fix: mirror Tools-Private —
create `2026-11.csv` (byte-copy), strip the Nov rows out of `2026-10.csv`, keep CRLF
endings so `diff -r` is clean. The seed workflow's `*.csv` glob picks up the new month
file automatically; the importer is idempotent (skips existing SourceIds), so the Oct
summary assertion (979,000) stays valid and live DB keeps both Nov rows. Dispatched
`Seed Expenses` (run 41308358557): 1m37s, live API verification passed (Oct summary
== 979000, `/api/expenses` without key → 401).

Pitfall: the "copy whole glob" durability in the seed workflow only covers *new* month
files — the **staging dir itself** must be mirrored each cron run. The daily duty is:
`diff -r /root/Tools-Private/Pengeluaran .github/seed-staging/ledger` (excluding
README/rekap) and reconcile.

## 2. Feature: two-step delete confirmation

`TransactionRow` had a one-click `Hapus` that fired DELETE immediately. Web-created rows
carry a `web-` SourceId and are NOT in Tools-Private, so an accidental tap permanently
lost a row with no undo. Added an armed-confirm flow:

- First click on `Hapus` arms confirmation: the trash button becomes a red `Yakin?`
  button + a `Batal` (✕) button; no DELETE is issued.
- Second click on `Yakin?` confirms; `Batal` disarms. Confirmation auto-disarms after
  5s (usesEffect timer) to avoid a permanently armed row.
- Hit target stays 44px (`w-11 h-11`), names consistent (`aria-label`).

Tests: rewrote the delete test to two clicks; added "requires confirmation before delete"
(no DELETE on single click, Yakin rendered, Hapus gone) and "cancel a pending delete"
(Batal restores Hapus, no DELETE). Frontend 446→447, backend 467, lint/build clean.
New bundle `index-BJMzDPdY.js` verified live byte-identical to local dist.

## Considered, not done (evaluation mode)
- AdvicePanel `analyseDate` uses browser-local today vs WIB elsewhere — only matters
  outside UTC+7, low value, skipped.
- `MAX_PAGES=20` list cap — not realistic for ~30 rows/month, skipped.
- Prefill today in Tambah form — minor convenience, not worth a run, skipped.
