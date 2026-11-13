# Cycle 132 — stepped-timing register for non-tag transitions (pixel2)

Small frontend-only micro-interaction consistency fix.

## The gap

The pixel2 register snaps rather than tweens: hover colour/border transitions are
re-timed from Tailwind's default smooth `cubic-bezier` easing to hard
`steps(2, jump-none)` beats. That stepping reaches elements through two paths
in `index.css`:

1. a global rule on `button, a, select, input, summary, [role='button']`
   (the interactive tag set), and
2. the `.pixel-shadow` / `.pixel-shadow-sm` class rules (which also set a
   120ms stepped duration).

Any element outside those two paths that still carried a `transition` utility
— e.g. a `div`, `li`, or `label` with `transition-colors` — was left on
Tailwind's default smooth easing. Three such spots remained, all hover states
added in recent cycles:

- `DailyUsageChart.tsx` — the two `group-hover` bar segments (output accent
  base + input cap) tweened smoothly on hover.
- `JobsView.tsx` — the paket-lamaran confirm checkbox `<label>` tweened its
  text colour smoothly on hover.

So the active data chart and the confirmation checkbox eased in while every
adjacent control snapped — a subtle but real drift off the register.

## What changed

Added the explicit arbitrary class `[transition-timing-function:steps(2,jump-none)]`
to those three elements (2 chart segments + 1 label). Purely an easing-curve
change on hover colour/border transitions; no new colours/corners/shadows,
no layout change, reduced-motion-safe (the global media block still zeroes
duration).

## Guard added

`frontend/src/__tests__/pixel2-stepped-timing.test.ts` — a source-level guard
(scanner family of pixel2-press-consistency) asserting that every element with
a `transition` utility that is NOT covered by the global stepped-timing tag set
— and carries neither `.pixel-shadow` nor an explicit `steps()` timing — is an
offender. This prevents a future smooth-tweening control from slipping back in
on an uncovered tag.

## Verification (all green)

- `npx tsc --noEmit` → 0 errors; `npm run lint` → clean.
- `npx vitest run --pool=forks` → **68 files / 1119 passed** (1118 + 1 new guard).
- `npm run build` → succeeds (only the pre-existing >500kB chunk note).
- `dotnet test tests/OmniChat.Tests -c Release` → **664 passed / 0 failed**
  (frontend-only change; deployment guards unaffected).
- Push → CI + Deploy green; live bundle hash matches local `dist`.
