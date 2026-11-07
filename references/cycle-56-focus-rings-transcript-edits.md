# Cycle 56 — focus-visible rings on transcript search input + inline edit textarea (2026-11-07)

**Commit `fafdba1`** (fix). Frontend-only, class-only + one new structural guard.

## Change

Two editable controls in `MessageList.tsx` used `outline-none` without a
replacement focus ring, so keyboard focus on them was visually invisible (WCAG
2.4.7 Focus Visible):

- The sticky in-transcript **search input** (`Cari di percakapan`).
- The **inline edit textarea** (user-bubble edit/resend mode).

Added the app's standard focus language to each:
`focus-visible:ring-2 focus-visible:ring-chill-accent/60`. No new tokens, no
new radii, no layout change. `prefers-reduced-motion` unaffected (rings are not
animated).

## New structural guard

Added a test to `a11y-typography.test.ts`: *every editable control that removes
its native outline must also carry a `focus-visible:ring`*. The previous a11y
guards assert on the design floor (colour, size, mobile text floor), not on
per-element focus indicators — cycle 54 noted this exact gap. This guard now
scans all `<input>/<textarea>/<select>` tags for `outline-none` without a ring
and fails if any appear.

## Verification

- tsc `--noEmit`: 0 errors; oxlint clean; `vite build` succeeds
- vitest: **779 passed** (was 778; +1 = the new guard)
- Guard anti-vacuity proven two ways: a Node replica of the scanner ran over the
  real source (0 offenders), and a fabricated violating control was detected
- dotnet test: **558 passed** (no backend/data touch; no DeploymentConfigTests
  guard references these class strings)
- Live: bundle hash `index-DQsVvvfR.js` matches local `dist/index.html` exactly;
  `/health` 200 Healthy; `/api/models` 401

## Lesson

`outline-none` on a real text input/textarea removes the native focus indicator;
if the design relies on a container border alone, keyboard users get no focus
signal. Pair it with an explicit `focus-visible:ring` (or `focus:border`) on
every editable control. A source-level guard that ties the two together is what
prevents this class of regression from returning.
