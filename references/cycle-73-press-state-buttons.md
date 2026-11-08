# Cycle 73 — press-state feedback on clear/reset/reveal buttons (2026-11-08)

Commit `df75661`. Frontend **866/866**, lint + build clean. A pixel2 micro-interaction
audit (scanning every `<button>` across `src/components/` for the full interaction
register — hover + active + focus-visible + rounded-none) found three buttons with a
hover and focus ring but **no pressed (active) state**, so they felt dead on click.

## What shipped
- `ChatStatsDialog` "Bersihkan" (clear range): added `active:bg-chill-elevated`
  + `active:translate-y-[2px]` (press-slide) + `transition`, matching the dialog's
  other bordered buttons.
- `HistoryFilters` "Reset": added `active:text-chill-accent-active` (darker sand)
  + keeps the underline on press.
- `LoginScreen` "Tampilkan/Tutup kunci" reveal toggle: added
  `active:text-chill-accent-active` for press feedback.

All three reuse existing @theme tokens (`chill-elevated`, `chill-accent-active`);
no new colours/corners introduced, so the pixel2 source guards and WCAG floors pass
unchanged.

## Verification
- `npx tsc --noEmit` → 0 errors; `npm run lint` → clean; `npm run build` → clean.
- `npx vitest run` → 59 files / **866 tests** pass (a11y, snapshot, pixel2 guards).
- Live bundle `index-BAK2HT6q.js` == local `dist/index.html` (verified post-deploy).
- `/health` → 200 `application/json`; `/api/models` → 401 `application/problem+json`.
