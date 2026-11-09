# Cycle 90 — message bookmarks (star important turns) (2026-11-09)

**Commit `67a53ea`** — backend + frontend, tested, CI/Deploy green, live bundle verified.

## What & why
Roadmap chat item "aksi pesan lengkap" already had like/dislike, copy JSON,
copy text, delete, regenerate/edit and export. What was missing: a way to
**star/pin important messages** inside a conversation so they are easy to spot
again (and survive reload). Build as a server-persisted flag mirroring the
proven feedback path, not a local-only extra.

## Backend
- `Message.IsBookmarked` (bool) on the entity; EF migration `AddMessageBookmark`
  (`20261109060305_AddMessageBookmark.cs`), just an `AddColumn` — production
  auto-migrates via `PersistenceInitializer`.
- `ConversationMessage` record now carries `IsBookmarked` (positional default
  `false` keeps existing constructions compiling) and `From()` maps it.
- `IChatHistoryRepository.SetMessageBookmarkAsync` + `ChatHistoryRepository`
  implementation (one query scoped by message id + owning conversation, returns
  false → 404 for unowned/unknown, same as feedback).
- `ConversationsController` `PUT /api/conversations/{id}/messages/{messageId}/bookmark`
  with `MessageBookmarkRequest { isBookmarked }`, 204/400/404, admin-only.

## Frontend
- `Message` and `ConversationMessage` gain `bookmarked?: boolean`.
- `historyApi.setMessageBookmark(conversationId, messageId, isBookmarked)`.
- `MessageList`: a star **Tandai pesan / Ditandai** `ActionButton` on *every*
  bubble (assistant + user), optimistic toggle keyed by index, rolls back when
  the server call fails, persists only when the message has a server id (drafts
  and guests stay local), and resets with the other transient state on
  `conversationKey` change. Star is filled with `text-chill-accent` when active.
- `App.tsx` wires `handleSetBookmark` (admin/server sessions only) into the
  admin transcript; guest transcript keeps the button local-only.

## Verification
- Backend `dotnet test tests/OmniChat.Tests -c Release` → **615/615** (was 607;
  +2 repository + 4 controller tests).
- Frontend `npx vitest run` → **946/946** (was 929; +7 MessageList bookmark
  tests, +3 historyApi). `npx oxlint` clean (only the pre-existing JobsView
  `Date` purity warning), `npm run build` succeeds.
- CI check-runs: React Build / .NET 10 Build / Deploy to VPS all **success**.
- Live bundle `assets/index-6U0nsFKr.js` == local `dist/index.html` exactly;
  bundle contains the bookmark strings.
- Live `PUT .../messages/{messageId}/bookmark` → 401 without auth (routed);
  `/health` healthy; `/api/models` → 401.

## Pitfall
Adding a new prop to `MessageListProps` does NOT destructure it into the
component — remember to add it to both the interface **and** the function
parameter list (TS2552), and the test harness's `renderList` must forward it or
the persist/rollback tests silently never call the handler.
