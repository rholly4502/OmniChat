# Cycle 79 — EventsView pixel icons + press feedback (2026-11-08)

## Fix (`1417a71`)
The Events tab was the last top-level view still using **text glyphs** as
decorative icons — `≡` (filter) and `▲`/`▼` (chevron) — where every other tab
(Jobs, Sidebar, Chat) uses crisp SVG pixel icons (`shapeRendering="crispEdges"`).
Text glyphs render with the typeface's own anti-aliasing and don't share the
pixel register; they also snap rather than rotate on open/close.

Changed both to the same SVG icon set JobsView's filter toggle uses:
- `≡` → three-rule filter icon (`<line>` x3)
- `▲`/`▼` → chevron `<polyline>` that `rotate-180` on open (stepped transition)

Also:
- Added `pixel-reveal` to the EventsView root for **tab-entrance parity** with
  ExpensesView/JobsView (which both animate on tab switch).
- Added tactile press feedback to the filter toggle (`active:bg-chill-elevated
  active:translate-y-[2px] active:shadow-none`) matching JobsView's toggle.

## Why the existing guards missed it
`pixel2-consistency.ts` bans soft corners / gradients / cold palette / non-pixel
shadows — all *class* tokens. Text glyphs are neither, so they slipped through.
The fix aligns EventsView with the established SVG convention rather than adding
a new guard for a one-off.

## Verification
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: **883 passed** (unchanged — no test file for EventsView exists)
- `npm run build`: success
- No C#/data/API touched; no deployment guard references EventsView
- CI + Deploy both **success** (polled via public GH API)
- Live bundle `index-D4wO3P6M.js` **byte-identical** to local `dist` (sha256
  0bed6268…); contains the new chevron polyline (4×) and `pixel-reveal`; no
  `≡`/`▲`/`▼` glyphs present
- Push: `1417a71` on `main`; `origin/main..HEAD == 0` (fully pushed)
