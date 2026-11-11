# Cycle 117 — press feedback on the sidebar session-row select button (2026-11-11)

**Commit `8cd2f36`** (frontend), CI green, Deploy green, live bundle
`assets/index-Dk0nnQ4e.js` matches local dist.

## What & why
A source-wide scan of every `<button>` in the app (the same scanner the
`pixel2-*` guards use, but extended to check for `active:`) found exactly one
interactive control with **no press feedback**: the session-row select button in
`Sidebar` (the main tap target to open a conversation). It had a `focus-visible`
ring and a hover highlight delegated to its wrapping row, but no `active:` state
— so a click gave no "pressed" cue, unlike every other button in the app.

Fix: added `active:bg-chill-elevated active:translate-y-[2px]` + `transition` to
that button, matching the established pixel2 press idiom used everywhere else.

Also extended the `pixel2-press-consistency` guard with a new assertion: *every
clickable (onClick, non-disabled) button must carry an `active:` press-feedback
state*. This locks the fix in and prevents any future button from regressing to
no press feedback.

## Verification
- `npx tsc --noEmit` → 0 errors; `npm run lint` clean; `npm run build` → bundle
  `index-Dk0nnQ4e.js`.
- vitest full suite: **1064/1064** pass (was 1063; +1 new guard).
- Backend untouched (UI-only; no C#/data change, no `DeploymentConfigTests`
  guard references the touched strings). Pushed to `main` (AHEAD=0).
- CI + Deploy green for `8cd2f36` (GitHub Actions briefly queued ~15 min — a
  runner incident; a re-run picked up and passed). Live bundle == local dist
  byte-identical; `/health` → 200 Healthy.
