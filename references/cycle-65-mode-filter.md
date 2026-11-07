# Cycle 65 — conversation history mode filter (2026-11-07)

**Commit `c25d07e`**, backend 576 -> **578**, frontend 840 -> **845**, lint/build
clean, live bundle matched.

## What
Added a **Mode (agent/direct) filter** to the history search row — a third
select beside the existing model and date filters, so an admin can narrow the
sidebar to agent vs direct conversations regardless of which model each ran on.

## Backend
- `IChatHistoryRepository.ListConversationsAsync` + `ChatHistoryRepository`: new
  optional `mode` filter (exact match on `Conversation.Mode`).
- `ConversationsController.List`: accepts `?mode=agent|direct`, passes through.

## Frontend
- `historyApi.ts`: `ConversationListFilters` gains `mode`; `listConversations`
  appends `mode=` when set.
- `useServerHistory`: `modeFilter` option forwarded to the list call; refetches
  on change (deps + filtersRef updated).
- `HistoryFilters.tsx`: new Mode select (Semua mode / Agent / Direct); Reset
  clears it too. `Sidebar.tsx` / `App.tsx` wire the prop through.

## Tests
- Backend: +2 repo (filter by mode, mismatch empty), controller
  `List_ForwardsModelAndDateFilters` updated to assert mode forwarding.
- Frontend: historyApi (+append/omit mode), useServerHistory (+forward+refetch
  on mode change, existing filter assertions updated), HistoryFilters (+render/
  change, reset), Sidebar (+forward test).

## Verification
- `dotnet test` 578/578; `vitest run` 845/845; `tsc -b`+`npm run build` clean;
  oxlint clean.
- Live bundle `index-Cv6d3dTp.js` == local `dist/index.html` exactly; `/health`
  Healthy (fresh restart); `/api/models` 401.
