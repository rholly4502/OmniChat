# Cycle 49 — sidebar latest-message preview (2026-11-06)

Commit `c8eef95`. Backend 535 → 539 tests; frontend 755 → 757; lint/build clean;
CI + Deploy green; live bundle `index-B-cnZGyZ.js` matches local `dist/index.html`;
backend `/health` uptime reset on deploy.

## What shipped
The history list now carries the newest message content per conversation, and the
sidebar renders it as a muted one-line subtitle under the title, so a conversation is
recognizable even when the sidebar is the only visible surface.

- Backend: `ConversationSummary` gains `Preview` + a truncating `From(conversation,
  preview)` overload (80-char, word-boundary cut). New
  `IChatHistoryRepository.GetLatestMessagePreviewsAsync` — owner-scoped, newest
  message per conversation. `ConversationsController.List` wires it.
- Frontend: `ChatSession`/`ConversationSummary` carry `preview`; `useServerHistory`
  maps it; `Sidebar` renders it under the title (pixel theme, `truncate`, muted).

## Pitfalls
- **Moq returns a null *result*, not a null Task.** A defensive `?? Task.FromResult(...)`
  on the repository call only guards a null Task; Moq hands back a completed Task whose
  result is null, so `previews.GetValueOrDefault(...)` threw NRE. Guard the awaited value
  too: `var previews = await task; previews ??= new Dictionary<Guid, string?>();`.
- **Owner scoping must be inside the query**, not implied by the caller's id list. The
  first version filtered messages only by conversation id, so a passed-in id belonging to
  another user leaked their latest message. Resolve owned conversation ids first, then
  query messages against those.
- **EF/GroupBy projection risk**: per-group `FirstOrDefault` projection isn't guaranteed
  to translate on SQLite. Fetch rows ordered (ConversationId, CreatedAt desc), then group
  in memory — within a group the first row is the newest.
