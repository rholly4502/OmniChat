# Cycle 135 — expenses data-panel titles get the pixel2 left-accent (border-l-2)

The pixel2 theme's `border-l-2 border-chill-accent` accent was used by the sibling
views' group headers (JobsView `group-*`, EventsView `app-*`) but missing from the
ExpensesView data-panel titles (Tren Bulanan, Pengeluaran per Hari/Minggu, Total per
Kategori, Transaksi). The task explicitly lists `border-l-2 aksen` as a theme element,
so this aligns the expenses tab with the rest of the app.

**One commit** — frontend-only, pure className addition (warm chill token, square), no
logic/aria change, no data touch (so backend `dotnet test` not required).

## Change
5 `<h3>` panel titles in `ExpensesView.tsx` gained `border-l-2 border-chill-accent pl-2`
prepended to their existing `text-xs ... uppercase pixel-heading` classes. The main
"Pengeluaran" page `<h2>` and the add/edit form title were deliberately left as-is (page
title and form header, not data panels).

## Verification (baseline was already green: tsc 0, vitest 1125/1125, build clean)
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` (full, `--pool=forks`) → **68 files, 1125/1125** green.
- Targeted re-run of ExpensesView + pixel2/a11y guards → 86/86 green.
- `npm run build` → success (pre-existing chunk-size warning only).
- Guards that could be affected passed unchanged: `pixel2-consistency`,
  `pixel2-css-consistency`, `pixel2-press-consistency`, `a11y-typography`.
  `ExpensesView.test.tsx` only asserts `pixel-heading` on the main `<h2>` — untouched.

## Note for future cycles
This cycle re-confirmed the cycle-134 finding: the surface is otherwise consistent and
guard-enforced. The only genuine gap found was this static accent omission — a styling
consistency fix, not a register/transition change (so the cycle-134 "register-first"
warning did not apply to `border-l-2`).
