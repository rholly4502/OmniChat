# Cycle 85 — Berpikir reasoning disclosure entrance animation (2026-11-08)

**Commit `f959fba`** — frontend-only CSS/class polish; the expanded "Berpikir"
(model reasoning) disclosure in `MessageList.tsx` popped in with no transition,
unlike every other expanding panel in the app (message bubbles and the advice
body use `pixel-reveal`). Added `pixel-reveal` to the revealed body so it snaps
in with the app's established stepped-reveal language (opacity + 4px rise, 200ms
`steps(3)`). Reduced-motion-safe via the global media block. No behavior change.

- `frontend/src/components/MessageList.tsx`: `pixel-reveal` on the `#reasoning-*` panel.
- `frontend/src/__tests__/MessageList.test.tsx`: assertion that the revealed body
  carries `pixel-reveal`.

## Verification
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: **917/917** pass (62 files; suite ~5.2 min).
- `npm run build`: succeeds (pre-existing chunk-size warning only).
- No backend change (no `.cs` touched) — backend suite untouched this cycle.
- CI + Deploy green post-push; live bundle hash matches local `dist/index.html`.
