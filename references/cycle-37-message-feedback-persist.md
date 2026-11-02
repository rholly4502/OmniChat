# Cycle 37 — Persisted message feedback (like/dislike) (2026-11-02)

Commit `15536ca` (backend + frontend). CI green (41s), Deploy green, deployed SHA
== pushed SHA, live bundle `index-CuZ5Q881.js` == local dist exactly. Backend
477→490, frontend 483→492.

## What shipped
- `Message.Feedback` EF column (migration `AddMessageFeedback`) + enum `MessageFeedback.Up/.Down`.
- `PUT /api/conversations/{id}/messages/{messageId}/feedback` — body `{"feedback":"up"|"down"|null}`,
  owner-scoped, admin-only (guests/anon → 401/404). 204 / 400 / 404.
- Stream: `ChatController` files the assistant reply BEFORE `[DONE]` (sets `turnCompleted`
  flag so the `finally` doesn't complete twice) and forwards the stored id as a
  `messageId` SSE frame. `api.ts` parses it as its own event (never content);
  `useChat` attaches it to the trailing assistant message.
- `MessageList` like/dislike are optimistic with rollback when `onSetFeedback` resolves false;
  reflect server ratings (`m.feedback`) on load; drafts/guests stay local-only.

## Pitfalls hit this cycle
- **Multiline Python anchors can fail byte-level while visually matching.** The prop-interface
  anchor `...=> void;\n} = {}) {` returned count 0 even though `repr` of that region showed
  identical bytes. Root cause not fully resolved (suspect an invisible char). Workaround:
  fall back to index-based splicing (`s.find(line)` + insert) instead of `str.replace` when a
  multiline anchor asserts 0. A shorter single-line fragment of the same text matched fine.
- **Inserting tests before a method that already has `[Fact]` duplicates the attribute.**
  Anchoring on the `public async Task ...()` signature keeps the preceding `[Fact]`, so my
  block's own `[Fact]` became an adjacent duplicate AND the target method lost its `[Fact]`
  (it sat inside my replaced span). Fix: anchor on a line that does NOT have a preceding
  `[Fact]`, or remove the original attribute in the same replace.
- Backend suite guarded this well: `duplicate 'Fact' attribute` was the first failure.

## Verify recipe
- `gh run list --limit 4` — CI row success, Deploy row success (check both; Deploy has no
  `needs:` on CI).
- Deploy log: `Target commit` == `Deployed commit` == push SHA; `backend healthy after 1s`;
  no `ERROR` line.
- Live `curl -s https://rhol-ai.tech/` bundle hash == `frontend/dist/index.html`.
- `curl https://rhol-ai.tech/health` → `{"status":"Healthy",...}`; feedback route w/o auth → 401.
