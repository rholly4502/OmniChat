# Cycle 131 — floating chat controls entrance animation (2026-11-13)

Commit `d35ec44`. FE 1114→1115, BE 664/664 (untouched). CI+Deploy green, live bundle hash matches.

## Change
The three floating transcript controls — **Lompat ke bawah** (jump-to-bottom),
bookmark navigation, and the in-transcript search toggle — appeared with **no
entrance animation** (instant conditional render), while every other surface in
the app enters via `pixel-reveal` (200ms stepped). Added `pixel-reveal` to all
three in `frontend/src/components/MessageList.tsx`.

Reduced-motion is handled by the global `prefers-reduced-motion` block in
`index.css` (animation-duration → 0.01ms), so the reveal collapses to static on
request. No new colours / rounded corners / tokens — pure reuse of the
established register. Purely a className addition: the buttons are
conditionally rendered, so the animation plays exactly on mount (the enter
state) and never re-runs on hover.

## Why this target
The pixel2 CSS guard (`pixel2-css-consistency.test.ts`) and component guards scan
for *anti-patterns* (cold palette, gradients, blur, soft shadow, rounded≠none) —
they don't flag a *missing* entrance. A source sweep for interactions that
change appearance on hover/active/focus found zero cold-token leakage and every
button carrying transition + hover + active + min-h-44 + focus-visible. The
floating controls were the one interactive surface in the app that popped in
without the stepped reveal. (They already had full press-feedback; only the
entrance was missing.)

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run src/__tests__/MessageList.test.tsx` → 122 pass (incl. new guard)
- `npm test -- --watch=false` → 67 files, **1115 pass**
- `npm run lint` → clean
- `npm run build` → success
- `dotnet test tests/OmniChat.Tests -c Release` → **664/664**
- CI + Deploy rows for `d35ec44` both `success`
- live bundle `assets/index-C8igPrbW.js` == local `dist` byte-identical
- `/health` → 200 `application/json`; `/api/models` → 401

## Guard test
Added `floating controls reveal with the pixel2 entrance animation` in
`MessageList.test.tsx`: asserts the jump-to-bottom and search buttons carry
`pixel-reveal` when shown.
