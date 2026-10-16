# Agent progress visibility (Tahap 2, item 5)

Date: 2026-10-16
Source: /opt/data/omnichat-brainstorm.md section 4.1a
Baseline: backend 263 tests, frontend 185 tests.

## Problem

The first token of an Agent-mode reply only arrives after the whole Hermes agent loop
finishes. Until then the UI shows three frozen dots and a "Menunggu respons..." placeholder,
so nobody can tell "the agent is working" from "the request is dead". The backend already
produces liveness frames on the wire (its own [Error: ...] frames), so the missing piece is a
timed progress signal plus a UI that renders it.

## Approach

Two layers, mirroring the existing error channel (ChatService writes an `error` frame ->
parseSseBuffer surfaces it -> useChat renders it):

1. Backend: ChatService emits {"status": "<phase>"} frames, one when the upstream call starts
   and one whenever the quiet period exceeds a threshold.
2. Frontend: StreamChunk.status carries the phase; useChat stores it on the trailing assistant
   message; MessageList renders it plus an elapsed-time counter above the "Menunggu respons"
   line, which stays intact for its existing tests and screen readers.

Live agent thinking (real per-tool events) is out of scope: the Hermes gateway was not observed
emitting gradual events, so this ships a timed heartbeat instead.

## Tasks

1. StreamingOptions.ProgressIntervalSeconds (default 10, <= 0 disables) + ProgressInterval.
2. ChatService: emit status frames at stream start and on each quiet interval, ahead of the
   first byte and mid-answer, never after the first token of a burst.
3. ChatController.WriteProgressAsync + WriteEventAsync switch on the data key.
4. api.ts: StreamChunk.status; parseSseBuffer passes a status frame through, never as content.
5. useChat: progress state while in flight, cleared in finally; message.status written.
6. types.ts: optional Message.status; MessageList renders that plus the elapsed counter.
7. Deployment guards in DeploymentConfigTests (frontend half, backend half, env name).
8. docker-compose.yml / .env.example / README: Streaming__ProgressIntervalSeconds.
9. CHANGELOG.md entry.
10. Verify: dotnet test, npm run test|lint|build, push, confirm CI + Deploy, live bundle hash,
    /health + /api/models, and a live send at 375px.
