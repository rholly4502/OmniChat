# Cycle 128 — DailySpendChart hover affordance (pixel2 parity)

## What changed
`DailySpendChart.tsx` (Pengeluaran tab) bars had a native `title` tooltip but zero
visual hover affordance — while its sibling `DailyUsageChart` (Chat tab) gained
hover feedback in cycle 124. Same per-day bar-chart pattern, one hoverable, one
not. This cycle aligns DailySpendChart to the same register:

- Active spend-bar wrapper gains `group cursor-pointer`.
- Accent (in-budget) bars: `transition-colors group-hover:bg-chill-accent-hover
  group-hover:border-chill-accent`.
- Red (over-budget) bars: `group-hover:bg-chill-red-hover
  group-hover:border-chill-red`.
- Zero-spend stub days stay non-hoverable (no `group`/`cursor-pointer`).

Purely additive classes, chill tokens only, no new colors/corners/animation,
reduced-motion-neutral (color transition only).

## Guard added
`DailySpendChart.test.tsx` → new `describe('DailySpendChart hover affordance')`
with 3 tests (accent hover, red-register hover, stub days non-hoverable),
mirroring the existing `DailyUsageChart hover affordance` suite.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 66 files / 1108 tests pass (incl. new trio)
- `npm run lint` → clean; `npm run build` → success
- `dotnet test tests/OmniChat.Tests` → 657/657 pass (no backend/UI-data change)
- Push triggers CI + auto-deploy; live bundle hash re-verified
