# Cycle 55 — regenerate/edit server-transcript rewind (2026-11-07)

Commit `b714eca`. Backend 543 -> 558 tests; frontend 772 -> 778 tests; lint +
build clean; push verified (origin/main == HEAD); live deploy verified (bundle
hash matches local dist).

## The bug
Regenerate and edit-resend only rewrote the in-memory transcript. The server
always *appended* (`ChatTurnRecorder.StartTurnAsync` writes a user row,
`CompleteTurnAsync` writes an assistant row), so reloading a stored conversation
resurrected the discarded old turns: the duplicate user prompt plus stacked
assistant replies appeared again, polluting the transcript and the audit table.

## Fix: optional `rewind` on the chat request
`ChatRequest.Rewind` (`ChatRewind`) with mutype = "regenerate" | "edit"`:
- **regenerate** -> `ChatHistoryRepository.DeleteTrailingAssistantAsync` removes
  the trailing assistant reply; the recorder skips the duplicate user append.
- **edit** -> `RewriteMessageAsync` rewrites the target user message and deletes
  every newer message. Requires `messageId` + `content` (controller cross-field
  validation returns 400 when malformed).

Both subtract the removed messages' tokens from the conversation aggregate, so
the sidebar/audit cost stays in sync. Frontend sends `rewind` only when the
active thread is a real server conversation (and, for edit, when the target turn
has a server id); local drafts keep the old append behaviour.

## Pitfalls hit
- `GetConversationAsync` takes non-nullable `Guid`; passing a `Guid?` is CS1503
  — use `id!.Value`. Repo tests: pass `conv.Id`, not the `Conversation` object.
- Moq expression-tree lambdas cannot contain `?.` — write
  `t => t.Rewind != null && t.Rewind.Type == "regenerate"`.
- A rewind on a nonexistent conversation safely no-ops (returns the id, creates
  nothing) — assert that contract, not a fallback-create.

## Verify recipe
- Backend: `dotnet test tests/OmniChat.Tests` (558). Frontend: `npm test` (778),
  `npm run lint`, `npm run build`.
- Deploy: live bundle hash == local `dist/index.html`; `/health` Healthy;
  `/api/models` 401.
