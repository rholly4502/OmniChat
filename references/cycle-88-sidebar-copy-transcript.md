# Cycle 88 — copy-transcript affordance on sidebar session rows (mobile parity) (2026-11-09)

**Frontend 923 → 926, backend 607/607, lint/build clean, CI + Deploy green.**

## What & why
The desktop-only `ChatHeader` was the *only* place offering "copy transcript" (Markdown → clipboard).
On mobile the header is hidden (`md:flex`), so a phone user had no way to copy a conversation — export
was reachable via the sidebar drawer's per-session export menu, but clipboard-copy was not. This closes
that parity gap by exposing a **"Salin (Markdown)"** item at the top of the existing per-session export
menu in the `Sidebar` (reachable via the mobile drawer and the desktop sidebar), reusing the already
injected `copyTranscript` (per-session) handler. No new 44px icon was added — the row of session actions
is already dense — so the affordance slots into the existing export menu surface instead.

## Changes
- `frontend/src/components/Sidebar.tsx` — new optional `onCopySession?: (session) => void | Promise<void>`
  prop; rendered as the first menu item in the session export menu (with a `role="separator"` divider)
  only when the handler is wired. Clicking stops propagation, closes the menu, and calls
  `onCopySession(session)`.
- `frontend/src/App.tsx` — wires `onCopySession={(session) => void copyTranscript(session)}`.
- `frontend/src/__tests__/Sidebar.test.tsx` — 3 new tests: item renders when wired, absent when not,
  clicking calls `onCopySession(session)` and closes the menu. The pre-existing "four formats" test is
  unaffected (no copy handler passed there).

## Verification
- `npx tsc -b`: 0 errors; `npx oxlint` clean; `npm run build` clean (pre-existing chunk-size warning only).
- `npx vitest run`: **926/926 passed (62 files)** — 3 new tests, zero regressions.
- `dotnet test tests/OmniChat.Tests`: **607/607 passed** (backend unchanged).
- Live bundle hash matches local `dist/index.html` after deploy.
