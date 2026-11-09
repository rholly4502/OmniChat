# Cycle 95 — mobile audit-dialog parity (2026-11-09)

**Commit `486b955`** — frontend-only, CI+Deploy green, live bundle verified.

## What & why
The per-conversation audit dialog (message-level token/cost table, CSV export)
was desktop-only: ChatHeader and Sidebar both exposed `onOpenAudit`, but the
mobile top bar neither accepted nor rendered it — mobile users had no path to
the cost footnote table for the active thread.

## Change
- `MobileTopBar` gains `onOpenAudit?` prop; renders an "Audit percakapan" button
  (min 44×44px, `aria-haspopup="dialog"`) inside the chat-view fragment, so it
  appears only on the chat view and never on expenses/jobs/events.
- `App.tsx` admin MobileTopBar wires `onOpenAudit={() => setAuditOpen(true)}`
  (the dialog already renders in the shared chat view, so it opens on mobile too).
- Guest top bar intentionally never renders it (no server session on audit).

## Verification
- Frontend 957 → **961** (4 new MobileTopBar tests: render/click; omitted without
  handler; hidden on non-chat views; never in guest). Lint clean; build clean
  (pre-existing chunk-size warning only).
- Backend unchanged (no source-text guard references MobileTopBar), 618/618.
- CI success, Deploy success; live bundle `index-Bz8M0xk-.js` == local `dist/`
  exactly; bundle contains `Audit percakapan` (×3); `/health` healthy; `/api/models`
  → 401 `application/problem+json`.
