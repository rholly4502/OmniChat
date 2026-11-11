# Cycle 112/113 — per-conversation feedback/bookmark tally in audit dialog (2026-11-11)

**Commit `5d5c98f`**, CI green, Deploy green, live bundle `index-D_KRSvzf.js` matches local dist.

## What
The per-conversation `ConversationAuditDialog` showed each turn's rating only as a row
marker (`Nilai` column) but had no aggregate summary, while the global `ChatStatsDialog`
shows cross-conversation up/down totals. Added a compact tally to the audit dialog's meta
strip: up/down/bookmarked counts, each rendered only when nonzero, with `title` attributes
(`Disukai` / `Tidak disukai` / `Ditandai`).

## Test counts
Frontend 1052 → **1054** (2 new tests in `ConversationAuditDialog.test.tsx`). Backend 642/642
untouched. lint + `tsc -b` + `vite build` clean.

## Pitfalls
- The bookmark indicator appears in two places: the per-row `aria-label="Ditandai"` cell AND
  the new tally wrapper (`title="Ditandai"`). `getByTitle('Ditandai')` throws "multiple
  elements found"; use `getAllByTitle(...)` and assert `some(el => el.textContent?.includes('1'))`.
- Keeping the tally as `title` on an HTML `<span>` (not on an SVG) avoids the React SVG
  `title` TS2322 typing trap; SVGs inside stay `aria-hidden="true"`.
- The tally is computed from `session.messages` (`m.feedback === 'up'/'down'`, `m.bookmarked`),
  matching the CSV's `umpan_balik`/`ditandai` columns, so UI and export agree.
