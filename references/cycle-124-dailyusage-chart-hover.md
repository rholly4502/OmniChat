# Cycle 124 — DailyUsageChart hover micro-interaction (2026-11-12)

Commit `PLACEHOLDER`. Frontend-only; backend untouched. CI + Deploy green; live bundle
`index-CkWvDQuU.js` matches local dist.

## Gap found
The per-day token usage chart (`DailyUsageChart.tsx`, shipped in `98cc48d`) was the one
interactive surface with **zero hover affordance**: each active-day bar carried a native
`title` tooltip, but the bar itself gave no visual cue it was hoverable and no feedback on
hover. Every other chart/control in the app has a hover state; this newest feature was the
exception.

## Fix
Added a `group` + `cursor-pointer` hook on the active-day bar wrapper, and chill-token hover
feedback on both segments, with a short color transition:
- Output segment: `group-hover:bg-chill-accent-hover` + `group-hover:border-chill-accent`
- Input segment: `group-hover:bg-chill-accent/60`
- Both carry `transition-colors` (globally nullified by the existing
  `prefers-reduced-motion` CSS block).
Only existing chill tokens and utility vocabulary; no new colors/corners/animation.

## Regression guard
2 new tests in `DailyUsageChart.test.tsx` ("DailyUsageChart hover affordance"):
- active-day bar carries `group cursor-pointer`, output segment carries the accent-hover +
  border hover classes, input segment carries the `/60` hover class, both `transition-colors`;
- zero-activity stub days stay non-hoverable (no `group.cursor-pointer`).
Pitfall: `div.bg-chill-accent/40` is an **invalid CSS selector** in jsdom (the `/` breaks
`querySelector`) — select children and filter by `className.includes` instead.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1101 passed, 66 files
- `npm run lint` (oxlint) → clean
- `npm run build` → success (chunk-size warning pre-existing/benign)
- C# deployment guard `Frontend_...` reads `DailyUsageChart.tsx` and asserts
  `DailyUsageChart` is present — still satisfied; no backend code changed.
- CI + Deploy rows green; live bundle hash matches local dist; `/health` → Healthy.
