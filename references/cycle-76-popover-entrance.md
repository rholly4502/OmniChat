## Cycle 76 — popover/menu entrance animation (2026-11-08)

**Commit `XXXX`**, frontend-only. CI + Deploy green, live bundle hash matched.

### What changed
The three transient popover/menu panels mounted instantly while every other surface
in the app (dialogs, bubbles, tab switches, views) enters with the stepped
`pixel-reveal` animation. Added `pixel-reveal` to:
- ChatHeader export-format menu
- CostDetailsPopover panel
- Sidebar session-row export menu

Reduced-motion is handled by the existing global `prefers-reduced-motion` media
block (duration ~0, 1 iteration → lands immediately on the visible state).

### Verification
- Frontend 871 → **874 tests** (3 new source-level guards in
  `src/__tests__/popover-transition.test.ts`, mirroring `dialog-transition.test.ts`).
- `npx tsc --noEmit` → 0 errors; `npm run lint` clean; `npm run build` succeeds.
- Backend 583/583 passing (no backend change).
