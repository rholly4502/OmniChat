# Cycle 63 — conversation archive/unarchive (2026-11-07)

**Commit `b6bb9b7`**, backend 571 → **576**, frontend 826 → **837**, lint/build
clean, CI + Deploy green, live bundle matched.

## What
Conversations can now be **archived** (hidden from the default history list) and
unarchived — a complement to pinning and date-grouping that lets users declutter
the sidebar without deleting threads. No expenses code touched.

## Backend
- `Conversation` entity: + `IsArchived` (bool).
- Migration `20261107000000_AddConversationArchive` (+ Designer + snapshot).
- `IChatHistoryRepository.SetArchivedAsync` (+ impl, mirrored `PinConversationAsync`).
- `ConversationSummary`/`ConversationDetail` DTOs: + `IsArchived`; new
  `ArchiveConversationRequest`.
- `ConversationsController.SetArchived`: `PUT /api/conversations/{id}/archive`
  (204/400/404), same owner/auth guards as pin.

## Frontend
- `types.ts`: ChatSession + `isArchived`; ConversationSummary + `isArchived`.
- `historyApi.ts`: `archiveConversation()` → PUT .../archive.
- `useServerHistory`: `archiveSession(id, archived)` + list/detail mapping carries
  `isArchived`.
- `Sidebar.tsx`: per-row archive/unarchive 44px icon button; **"Tampilkan arsip"**
  toggle (checkbox-style) that reveals archived rows; archived rows hidden by default
  (`showArchived` filter on the date-group render).
- `App.tsx`: `showArchived` state + `handleArchiveSession` wiring.

## Tests
- Backend: +2 repo (set/unset + unowned), +3 controller (204/404/guest-no-touch).
- Frontend: +4 useServerHistory (archive/unarchive/server-refuse/draft), +2 historyApi,
  +5 Sidebar (toggle renders/hides, already-archived state, draft-hidden, toggle reveal).

## Verification
- `dotnet test` 576/576; `vitest run` 837/837; `tsc -b`+`npm run build` clean; oxlint clean.
- CI green (~45s), Deploy green (~1m40s), `Target/Deployed commit: b6bb9b7`.
- Live bundle `assets/index-B00bC8SA.js` == local `dist/index.html` exactly; `/health`
  Healthy; `/api/models` 401 (auth intact).

## Pitfall (recurring)
The secret scanner masks `'k'` as `***` in terminal output. When copy-pasting a test
that asserts `{ apiKey: 'k' }`, the literal `***` lands in the file → oxlint
"Unexpected token" (which `tsc --noEmit` did NOT flag). Always re-check test bytes
after insertion, and keep the apiKey literal spelled correctly.
