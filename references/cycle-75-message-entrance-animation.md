# Cycle 75 — chat message-bubble entrance animation (pixel2)

Commit: `722da8a`. Frontend only. FE 871/871, BE 583/583, tsc/lint/build clean.

## What changed
`frontend/src/components/MessageList.tsx`: the message bubble wrapper gained the shared
`pixel-reveal` stepped entrance (opacity 0→1 + translateY(4px)→0, 200ms steps(3)).
Before, user/assistant bubbles just popped in with no animation while every other
surface (views, dialogs, advice body, revealed panels) already used the pixel
entrance. This makes the primary chat interaction feel consistent with the rest of
the app's "animasi masuk halus".

## Why it is safe
- Bubbles are React-keyed by index, so a *new* message mounts and animates once;
  during streaming the assistant bubble is the same DOM node (text mutates), so
  token updates do NOT re-trigger the animation.
- `prefers-reduced-motion` is handled by the global media block in index.css
  (duration ≈0 → lands straight on the visible state).
- Frontend tests use partial `toHaveClass`, so adding a class is non-breaking
  (verified: 871/871 stayed green).

## Verification
- `npx tsc --noEmit` → 0 errors
- `npm run lint` (oxlint) clean
- `npm run test -- --watch=false` → 59 files, 871 passed
- `npm run build` → success (chunk-size warning pre-existing, unrelated)
- `dotnet test tests/OmniChat.Tests` → 583 passed, 0 failed (UI-only change)
