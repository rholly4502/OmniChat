# Cycle 71 — modal-dialog stepped pixel entrance (2026-11-07)

Commit `4ed3925`, CI green (~35s), Deploy green (~55s), live bundle hash matched.

## What changed

The full-screen modals — `ChatStatsDialog` and `ConversationAuditDialog` — mounted
instantly (`if (!open) return null`) with zero enter feedback, while every other
surface (tab switches, the mobile sidebar scrim, embedded panels) uses the
stepped pixel transition language (`pixel-overlay-fade`, `pixel-reveal`).

- Backdrop now carries the shared `pixel-overlay-fade` (160ms, 2-step opacity
  snap) — the same class the mobile sidebar scrim uses.
- Panel now carries `pixel-reveal` (200ms steps(3), opacity + translateY(4px)).
- Both are existing keyframes/tokens — no new colors, corners, or CSS. Reduced
  motion stays handled by the global `prefers-reduced-motion` media block
  (duration → ~0 → settles on the visible state immediately).

## Why entrance-only

The app's established convention is entrance-only animation (the sidebar scrim
also unmounts instantly on close). A full exit phase would require a "closing"
state in the dialog hook — more invasive than the polish warrants. `useModalDialog`
focus behavior and the focus trap are untouched.

## Guard added

`frontend/src/__tests__/dialog-transition.test.ts` — source-level guard mirroring
`view-transition.test.ts` (jsdom cannot resolve CSS animations, so it reads
source): asserts each dialog's backdrop contains `bg-chill-bg/60
pixel-overlay-fade` and its panel `pixel-shadow p-4 space-y-3 pixel-reveal`.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: **862 passed** (59 files; incl. the new 4-test guard).
- `npm run build`: success — bundle `index-D98mf5gc.js`.
- `dotnet test tests/OmniChat.Tests -c Release`: **583 passed**, 0 failed
  (after `clean-test-db.sh`).
- CI completed success; Deploy completed success for `4ed3925`.
- Live bundle `assets/index-D98mf5gc.js` == local `dist/...` SHA256 match
  (605,073 bytes). `/health` → 200 `application/json` Healthy.
