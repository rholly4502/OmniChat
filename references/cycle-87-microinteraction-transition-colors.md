# Cycle 87 — transition-colors pass on hover/active controls (2026-11-08)

**Frontend-only polish commit.** Goal: per cycle prompt item 2 ("transisi warna/border
singkat" on hover/active/focus), every interactive control that changes colour on
hover/active should *transition* briefly instead of snapping. The global
`@media (prefers-reduced-motion: reduce)` block in `index.css` already zeroes all
transition durations, so this is reduced-motion-safe by construction.

## What & why
A source scan found a handful of interactive controls with `hover:`/`active:` colour
changes but no `transition` utility — the colour snapped instantly, inconsistent with
the rest of the app (most buttons already carry `transition`). Added `transition-colors`
to each. All are existing `min-h-[44px]` touch targets with `focus-visible:ring-2`
already present — no size/focus/aria change.

## Changes (all `frontend/src/components/`)
- `MessageList.tsx` — the chat-transcript **search nav buttons** (prev / next / close)
  and the newline-wise `transition-colors` on their hover/active colour shift.
- `Sidebar.tsx` — mobile close button + drawer **export-menu items**.
- `ChatHeader.tsx` — header **export-menu items**.
- `MobileTopBar.tsx` — mobile hamburger (open) button.
- `HistoryFilters.tsx` — "Hapus semua filter" text button.
- `ChatStatsDialog.tsx` — apply/export scope buttons (3).

## Verification
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: **923/923 passed (62 files)**.
- `npm run build`: succeeds (pre-existing chunk-size warning only).
- `dotnet test OmniChat.slnx -c Release`: **607/607** passed.
- CI + Deploy green post-push; live bundle hash matches local `dist/index.html`.
