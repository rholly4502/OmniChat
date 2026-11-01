# Cycle 31 — expense trend chart joins the pixel meter register (2026-11-01)

## What & why
ExpensesView / AdvicePanel were already pixel2-complete (audited this cycle: zero
soft corners across the whole frontend, no gradients/glows, no cold slate/cyan,
every control carries `.pixel-shadow*` + stepped `steps(2)` transitions, ≥44px
targets, WCAG AA, and the full-canvas `.pixel-grid` overlay already covers the
expenses view from the App root). The one residual inconsistency was the
**ExpenseTrendChart bars**: solid flat blocks, while every other meter in the app
(PixelProgress, CategoryBar) speaks the segmented/bevel pixel register.

Research (this run): UI Lingo "Bevel recipe" = 1px light bevel top/left on flat
fill; Pixeli "one kit, one language" = shared outline weight + corner shape + light
direction. Applied a hard top-left bevel highlight to the filled bars.

## Change
`ExpenseTrendChart.tsx`: filled bar wrapped in `relative`, gained an
`aria-hidden` `bg-chill-accent-hover/80` top strip (`h-[2px]`) — a hard light
top edge, no gradient. Data/aria/tooltip unchanged.

## Verification
- Frontend: 423/423 tests (1 new assertion locks the bevel), oxlint clean,
  `vite build` clean.
- Backend: 452/452.
- No C# deployment guard references expenses/advice/trend (grep of
  DeploymentConfigTests empty), so no guard update needed.
