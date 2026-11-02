# Cycle 38 — Message feedback audit + heartbeat idle abort fix (2026-11-02)

Commit `b3eac62`. CI 53s, Deploy 1m7s green. Deployed SHA == b3eac62 (no ERROR line),
live bundle `index-O9Js_JVv.js` matches local dist exactly.

## Feature (P3 "fitur audit chat"): aggregate message feedback into usage/audit overview

Message like/dislike feedback was persisted per-message but never aggregated, so there
was no audit view of it. This cycle surfaces it in the existing usage overview.

- **Backend:** `ConversationUsageSummary` gains `TotalUpFeedback`/`TotalDownFeedback`.
  `GetUsageSummaryAsync` now counts feedback across every message of the caller's
  conversations (joins `Messages` by owner, groups by non-null Feedback). Guest still
  gets `Empty`; no per-model feedback breakdown (token breakdown stayed the only model
  dimension).
- **Frontend:** `ConversationUsageSummary` type + `EMPTY_USAGE` + `historyApi` fallback
  gain `totalUpFeedback`/`totalDownFeedback`. Sidebar "Penggunaan" details panel shows a
  "Umpan balik pesan" row (up/down counts) only when at least one message is rated.
- Tests: backend +2 (`GetUsageSummary_aggregates_message_feedback_across_conversations`,
  `GetUsageSummary_feedback_excludes_other_users_messages`); frontend +2
  (render counts, omit when zero). Backend 495→497, frontend 502→504.

## Bug fix: heartbeat could emit a progress frame AFTER the terminal idle-deadline error

`StreamChatResponseAsync_SilentUpstreamWithHeartbeat_StillAbortsAfterIdle` was failing:
`tokens[^1]` was `[status: Berpikir…]` instead of the error. The heartbeat wrote progress
frames with `CancellationToken.None`, so when the idle deadline aborted the read, a beat
already in flight landed one more frame after the error frame — breaking the "last frame
is the error" contract.

Fix (in `ChatService.cs`):
1. Heartbeat `CancellationTokenSource` is now linked to the idle deadline
   (`CreateLinkedTokenSource(ct, idleCts.Token)`), so a real idle timeout cancels it
   promptly.
2. In the inner idle-timeout catch, the heartbeat is cancelled AND awaited *before* the
   terminal error frame is written, so nothing can be appended after it.

This was a genuine regression, not a flaky test — the test had been red before this cycle
im started with 1 failing backend test (494 passed / 495).

## Verify
- Backend: `dotnet test tests/OmniChat.Tests` → 497 passed.
- Frontend: `npm test -- --watch=false` → 504; `npm run lint` clean; `npm run build` clean.
- `GET /api/conversations/usage` returns 401 `application/problem+json` without a key (auth intact).
