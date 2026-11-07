# Cycle 53 — expense transaction-row hover micro-interaction (2026-11-07)

**Commit `6ae4219`** (feat) + this archive doc. Frontend-only.

## Change
The expense transaction row (`TransactionRow` in `ExpensesView.tsx`) was the one
interactive surface in the app with no hover feedback — every other control
(chips, tabs, buttons, cards) brightens to `chill-elevated` on hover. In a long
expense list that made scanning and locating a row's edit/delete actions
visually silent.

Added the app's established pixel interaction language to the row's `<li>`:

```
transition hover:bg-chill-elevated
```

Same `chill-elevated` surface tone used everywhere, hard-edged, stepped by the
global `steps(2, jump-none)` transition rule, and auto-disabled under
`prefers-reduced-motion`. No new tokens, no new radii, no shadow changes.

## Test
New `ExpensesView.test.tsx` case renders the list and asserts every transaction
row carries `transition` + `hover:bg-chill-elevated` (so a future refactor
cannot silently drop the micro-interaction again).

## Verification
- tsc `--noEmit`: 0 errors; oxlint clean; `vite build` succeeds.
- vitest: **771 passed** (was 770, +1).
- dotnet test: **543 passed** (backend untouched; the two `DeploymentConfigTests`
  guards that read `ExpensesView.tsx` still pass — they check for `Ekspor PDF` /
  `ExpenseForm` / `Tambah Pengeluaran` / `Hapus`, none of which moved).
- CI + Deploy both `success` on `6ae4219`; live bundle `index-DlEIRh-4.js`
  matches local `dist` byte-for-byte; `/health` → 200 (container restarted,
  uptime reset), `/api/models` → 401.

## Lesson
The guards enforce the design *floor* (corners, palettes, focus rings, 44px
targets), not the presence of individual micro-interactions. A component that is
fully "compliant" can still lack hover feedback — audit each interactive surface
for the hover/transition language explicitly rather than assuming the floor
covers it.
