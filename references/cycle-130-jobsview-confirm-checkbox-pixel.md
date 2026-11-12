# Cycle 130 — JobsView confirm-checkbox pixel register alignment (pixel2)

## What changed

The "Paket lamaran" confirmation checkbox in `JobsView.tsx` was the only checkbox in
the app not on the pixel2 register: it used the native browser control via
`accent-chill-accent` (soft/rounded, no pixel focus ring) while every other checkbox
(Sidebar mode/night/focus/chill toggles) uses the shared `pixel-checkbox` square
(hard-edged, chill accent, `:focus-visible` ring from `index.css`).

- `<input type="checkbox">` class `mt-0.5 h-4 w-4 accent-chill-accent` →
  `mt-0.5 h-4 w-4 pixel-checkbox`.
- Wrapping `<label>` gained the standard interactive-text affordance
  `transition-colors hover:text-chill-accent` (parity with hoverable sidebar text)
  on top of the existing `cursor-pointer`. The label remains the full tap target,
  so the 16×16 visual stays within the 44px floor per the CSS comment.

Purely additive/surgical class change, chill tokens only, no new colors/corners/
animation, reduced-motion-neutral (color transition only). No backend/UI-data change.

## Guard added

`frontend/src/__tests__/pixel2-consistency.test.ts` → new
`describe('pixel2 checkbox register consistency')` asserting every
`<input type="checkbox">` in shipped source carries `pixel-checkbox`, so a future
native-accent checkbox cannot slip back in.

## Verification (all green)

- `npx tsc --noEmit` → 0 errors; `npm run lint` → clean; `npm run build` → success.
- `npx vitest run` → 67 files / **1114 passed** (was 1113 + 1 new guard).
- `dotnet test tests/OmniChat.Tests -c Release` → still green (frontend-only change).
- Live bundle hash matches local `dist` after deploy; CI + Deploy rows green.
