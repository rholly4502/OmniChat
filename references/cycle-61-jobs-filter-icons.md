# Cycle 61 — JobsView filter controls: crisp SVG icons + stepped chevron rotation (2026-11-07)

Commit: `polish(ui): crisp SVG icons + stepped chevron rotation on jobs filter toggle`. Frontend-only; backend untouched.

## Changes
Replace the text-glyph placeholder icons on the JobsView filter toggle with crisp pixel
SVGs and add a stepped-rotation micro-interaction to the collapse chevron:

1. **Filter icon** — the `≡` text glyph became a 14×14 three-line SVG (stroke `currentColor`,
   `strokeLinecap="square"`, `shapeRendering="crispEdges"`), matching the icon discipline used
   everywhere else in the pixel2 theme (no text-as-icon).
2. **Chevron** — the `▲`/`▼` text glyph became a crisp polyline chevron that rotates 180° with
   the same stepped transform transition as the sidebar's `<details>` toggles
   (`transition-transform duration-150 [transition-timing-function:steps(3,jump-none)]`,
   `rotate-180` when open). This gives the collapse/expand a real, visible feedback beat.
   Reduced-motion is honored by the existing global `prefers-reduced-motion` block (transition
   duration ~0 → it settles instantly).

All tokens are existing chill tokens (`text-chill-muted`); no new color/corner introduced.

## Tests
- `JobsView.test.tsx`: +1 (`uses crisp SVG icons and rotates the chevron with a stepped
  transition on toggle`). Asserts the chevron is an SVG with `rotate-180` + the stepped
  transition class when open, clears rotation on collapse, restores on expand, and that no
  `≡`/`▲`/`▼` text glyphs remain.
- **Pitfall:** SVG `className` is an `SVGAnimatedString`, not a string — read the real class
  list with `el.getAttribute('class')` (matches the Cycle 28 finding).

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 816/816 (57 files).
- `npm run lint` → clean; `npm run build` → success (bundle `index-CQHhKSb3.js`).
- `dotnet test tests/OmniChat.Tests -c Release` → 571/571.
- pixel2 guards (incl. `pixel2-css-consistency`) stay green.
