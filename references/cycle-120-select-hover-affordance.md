# Cycle 120 — select hover border affordance (2026-11-12)

Commit `05c6c1a`. Frontend-only; backend untouched. CI + Deploy green; live bundle `index-Q-N4zs1z.js` matches local dist.

## Gap found
The sidebar model `<select>` carried `hover:border-chill-accent/60` — the only select with hover feedback. Four standalone form/filter selects had none, so hovering them gave zero affordance:
- `ExpensesView.tsx` — category filter (filter bar) + kategori (form)
- `HistoryFilters.tsx` — model + mode filters

Inline header selects (ChatHeader / MobileTopBar) are intentionally borderless (transparent bg inside a badge), so they are correctly excluded.

## Fix
Added `hover:border-chill-accent/60` + `transition-colors` to those four bordered selects — same register as the sidebar model select, no new colors, stepped via the global 120ms steps(2) rule.

## Regression guard
New test in `pixel2-consistency.test.ts`: every `<select>` that carries `border border-chill-border` must also carry `hover:border-chill-accent/60`. Scoped to bordered selects so borderless header selects don't false-trip.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1078 passed (1077 + 1 new guard), 65 files
- `npm run build` → success
- CI 43157445697 success, Deploy 43157445687 success (SHA 05c6c1a)
- Live bundle `assets/index-Q-N4zs1z.js` == local `dist/index.html` exactly
- `/health` → `{"status":"Healthy",...}`; `/` → 200
