# Cycle 37 — evaluation-mode fix: month picker jumps to saved row's month (2026-11-01)

Commit `3dcae24`, CI green, Deploy green, live bundle `index-CTGv9997.js` matches, backend 477/477, frontend 471/471, lint/build clean.

## The gap (found in evaluation mode)
P1-4/P1-5 CRUD was shipped and green, but `handleSave` always `reload()`ed and never
switched `month`. Saving a row whose date falls in a different month than the viewed one
(e.g. viewing Nov, entering an Oct expense, or editing a date across a month boundary)
wrote to the DB but the row never appeared — it looked like a silent failed save.

## The fix
In `ExpensesView.handleSave`, after a successful create/update:
`const savedMonth = payload.tanggal.slice(0, 7); if (savedMonth !== month) setMonth(savedMonth); else reload();`
Now the picker jumps to the month the row actually landed in, so the result is always visible.

## Test added
`jumps the month picker after saving a row dated in a different month` — pins month to
2026-10, POSTs a 2026-11-02 row, asserts a subsequent `month=2026-11` fetch fires.

## Ledger sync check (P1-1)
Tools-Private vs staging mirror: all four files IDENTICAL. Air 2026-11.csv (3 rows:
Sarapan 23k / Makan 30k / Sewa kos 1.3jt) staged; hourly seed green.
