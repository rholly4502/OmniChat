# Cycle 121 — ExpensesView per-kategori empty-state register parity (2026-11-12)

Commit `a06faf6`. Frontend-only; backend untouched. CI + Deploy green; live bundle
`index-BX-TiaZG.js` matches local dist.

## Gap found
The `Total per Kategori` section empty state rendered as a bare `<p>` — the only
section-level empty in the app with no icon. Siblings all carry at least an icon:
Jobs/Events use the full `border border-chill-border bg-chill-surface pixel-shadow`
panel; the expenses transaction list uses an inline icon+text row. The month-level
illustrated empty (`Belum ada data pengeluaran bulan ini.`) was left untouched — it
already sits in the decorated centered block, so it is intentional.

## Fix
`ExpensesView.tsx` per-kategori empty now uses the shared inline register (same as
the transaction-list empty): bar-chart icon (`text-chill-accent`, square linecaps,
miter joins) + `text-sm text-chill-muted`, inside `flex items-center gap-2`. Only
existing chill tokens; no new colors/corners.

## Regression guard
New `pixel2-consistency.test.ts` test pins that exact sentence to the icon+text row
(`flex items-center gap-2` + a preceding `<svg>`), so it can't regress to bare text.
A second blanket "no bare empty" guard was drafted and dropped — the decorated
illustration block legitimately holds a bare paragraph, and ancestor-parsing across
the ornament wrapper div was brittle. Guard 1 alone precisely protects the change.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1081 passed (1080 + 1 new guard), 65 files
- `npm run build` → success (chunk-size warning pre-existing/benign)
- CI completed success, Deploy completed success (SHA a06faf6)
- Live bundle `assets/index-BX-TiaZG.js` == local `dist/index.html` exactly
- `/health` → `{"status":"Healthy","version":"1.0.0.0",...}`
