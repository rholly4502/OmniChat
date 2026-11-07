# Cycle 54 — focus-visible rings on inline model-switcher selects (2026-11-07)

**Commit `...`** (fix). Frontend-only, class-only.

## Change
Three `<select>` elements (the inline model switcher that sits inside the mode
badge chip) had `appearance-none` + `outline-none` but **no** focus-visible
indicator — tabbing to them with a keyboard gave a visually invisible focus.
Every other control in the app uses `focus-visible:ring-2
focus-visible:ring-chill-accent/60`; these three were the exceptions.

Added the app's established focus language to each:

- `ChatHeader.tsx` — desktop header model switcher
- `MobileTopBar.tsx` — mobile model switcher (two instances, agent/direct)

No new tokens, no new radii, no layout change. `prefers-reduced-motion` is
unaffected (rings are not animated).

## Verification
- tsc `--noEmit`: 0 errors; oxlint clean; `vite build` succeeds
- vitest: **772 passed** (unchanged — class-only, no behavior test needed)
- dotnet test: **543 passed** (no backend/data touch; no DeploymentConfigTests
  guard references these select class strings)

## Lesson
`appearance-none` selects that disable the native outline must replace it with
an explicit `focus-visible` ring, or keyboard focus becomes invisible — a WCAG
2.4.7 (Focus Visible) failure the a11y guards don't catch because they assert on
the design floor, not on per-element focus indicators. Auditing every interactive
element for a focus-visible class is a manual pass.
