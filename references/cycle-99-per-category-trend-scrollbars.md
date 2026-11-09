# Cycle 99 — per-category MoM trend shipped + pixel/chill scrollbars (2026-11-09)

## Commit `74ed8fc` — feat(expenses): per-category month-over-month trend in advice panel
Verified and pushed pre-existing uncommitted work found in the working tree at run start:
- Backend: `ExpenseAdviceService` now loads prior-month rows and emits
  `CategoryTrendItem(Kategori, Total, PreviousTotal, Delta, PercentChange)`
  per category (Nabung excluded from the baseline). New unit test
  `CategoryTrend_carriesPreviousMonthComparison`.
- Frontend: `CategoryTrendItem` in `expensesApi.ts` gains optional
  `previousTotal/delta/percentChange`; `AdvicePanel` renders a label under each
  compared category (Lebih besar/Lebih hemat/Baru di bulan ini), absent for
  older payloads. Two new AdvicePanel tests.
- Verified before push: backend **619/619**; `tsc --noEmit` clean; AdvicePanel
  41/41. `origin/main..HEAD` == 0 after push.

## UI polish — pixel/chill scrollbars (index.css)
Added a themed scrollbar to `index.css` (square thumb in the `chill-border`
register on the `chill-bg` track; accent on hover; `scrollbar-width: thin` for
Firefox, `-webkit-` rules for Chromium/Safari). Compiles with the pixel2 CSS
guard (`pixel2-css-consistency.test.ts` + `pixel2-consistency.test.ts`: 24/24),
oxlint clean. Purely decorative chrome — no motion, so `prefers-reduced-motion`
is unaffected.

## Audit result — pixel2/chill system already fully enforced
Systematic audit of every tab + shared shell found the design floor uniformly
upheld with no gaps warranting further changes: zero raw-hex literals (tokens
only), all corners `rounded-none`, every button ≥44px with a `focus-visible`
ring and press state (`active:translate-y`/`active:shadow-none`), `aria` labels,
`role="status"`/live regions on loaders, and reduced-motion handled globally in
`index.css`. All six `group-hover` reveals are decorative easter eggs already
paired with `group-focus-within` (keyboard-safe), not hover-only controls.
No speculative cosmetic churn introduced.
