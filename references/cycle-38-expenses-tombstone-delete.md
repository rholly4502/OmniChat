# Cycle 38 — Expenses: tombstone web-deleted ledger rows (2026-11-02)

Commit `292783e` (backend + migration). CI green (45s), Deploy green (1m3s),
live bundle `index-C1hqBgmP.js` == local dist (frontend untouched). Backend
490→494 (4 new tests), frontend 494 (no changes).

## The bug (found in evaluation mode)

P1-5 delete was inconsistent with the self-healing importer. `DeleteAsync`
removed a ledger-seeded row from the DB, but the hourly seed (`ExpenseImporter`
→ `InsertMissingExpensesAsync`) re-inserts any SourceId **not present** in the
DB. So deleting a ledger row resurrected it within ≤1h. Web-added rows
(SourceId `web-...`) are never in the ledger and were never affected.

## The fix — tombstone table

- New entity `ExpenseDeletion` (SourceId, unique index). `ExpenseDeletions`
  table via migration `20261102065248_AddExpenseDeletions` (only creates that
  table + unique index — verified).
- `DeleteAsync`: before removing a row, if it has a SourceId, insert a
  tombstone (idempotent — skips if already present).
- `InsertMissingExpensesAsync`: union existing SourceIds with tombstoned ones
  before computing `missing`, so a tombstoned row is never re-inserted.

## Tests

- `ExpenseRepositoryTests`: ledger-row delete not re-inserted on re-seed; web-row
  delete not re-inserted; no-SourceId delete still removes.
- `ExpenseImporterTests.Import_doesNotResurrectWebDeletedLedgerRow`: import 2
  rows → delete one → re-import → inserted=0 and the deleted row stays gone,
  the other remains.

## Pitfall

The first edit of `ExpenseRepository.cs` accidentally dropped the `var missing`
computation (CS0103) — the anchor-based replacement consumed the block below it.
Reverify the full method body after a multi-block replace, not just the anchor.

## Ledger sync (same run)

Tools-Private had a `2026-11-02` "Makan siang 30k" row committed into the
**October** file (commit `83a9c93`, message says "2026-10-31"). Moved to Nov per
precedent `526a14a` (CRLF preserved). Oct total 1,009,000 → 979,000. Pushed
Tools-Private `e77d150`, staging ledger `a90e1fb`. Seed run `41402265917` green;
live verification: `Summary total = 979000`, ledger floor = 979000, 401 without
key — pass.
