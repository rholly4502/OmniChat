# Cycle 93 — animate press-slide on 8 buttons (2026-11-09)

**Frontend-only polish commit `d9fce3b`.** Complements cycle 87 in the press-slide
direction: cycle 87 added `transition-colors` to controls that *change colour* on
hover/active with no slide, so the colour tweens. This cycle fixes the inverse —
buttons that *do* press-slide (`active:translate-y-[2px]`) but only carried
`transition-colors`, which **excludes `transform`**, so the slide snapped instantly
while the colour animated. The pixel press-slide (2–3px) should animate smoothly.

## What & why
A source scan (`buttonTags` regex) found 8 styled `<button>`s combining
`active:translate-y-[2px]` with `transition-colors`. Because Tailwind's
`transition-colors` transition-property list does **not** include `transform`, the
translate is not tweened — inconsistent with every other pressed button in the app
(which uses the bare `transition` shorthand: color + transform). Changed each to the
`transition` shorthand so the press-slide animates. Reduced-motion-safe by
construction (the global `prefers-reduced-motion` media block zeroes transition
durations). No size/focus/aria/token change; all remain `min-h-[44px]` with
`focus-visible:ring-2` and `cursor: pointer` (global rule).

## Changes (8 buttons, 5 files, all `frontend/src/components/`)
- `MessageList.tsx` — ActionButton row, search prev/next/close (4).
- `MobileTopBar.tsx` — hamburger (open) button (1).
- `Sidebar.tsx` — mobile close button (1).
- `ChatStatsDialog.tsx` — apply-range button (1).
- `CodeBlock.tsx` — copy button (1).

## New guard
Added a `pixel2-consistency.test.ts` test: every `<button>` using `active:translate-y`
must use the `transition` shorthand (covers transform), never `transition-colors`.
This locks the convention so a future copy-paste regression can't reintroduce the
snap. (Without this, the 8 buttons could silently regress and no rendered test would
catch it — jsdom resolves neither geometry nor Tailwind transition lists.)

## Verification
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: **952/952 passed (63 files)** — includes the new guard (12/12 in that file).
- `npm run build`: succeeds (pre-existing chunk-size warning only).
- `dotnet test tests/OmniChat.Tests -c Release --no-build`: **617/617** passed (frontend-only change; backend untouched).
- Pushed `d9fce3b`; CI **and** Deploy green; `origin/main` == HEAD (0 behind).
- Live bundle `transition-colors` count (7) matches local build from same commit (was
  15 pre-fix) — confirms the change is live. (Live bundle filename differs from local
  because CI builds its own hash; content parity is the signal.)
