# Cycle 70 — date-window scoping for the aggregate chat usage summary (2026-11-07)

Commit `8c4cd4a`, CI green (~?s), Deploy green (~?s), live bundle `index-PNgkHk5W.js`
matches local dist exactly.

## Gap
The global ChatStatsDialog was lifetime-only while the history list already supported
model/mode/date filters. It couldn't answer "how much did I spend this month". Mirror
the list filter on the aggregate usage endpoint.

## Backend
- `IChatHistoryRepository.GetUsageSummaryAsync(userId, from?, to?, ct)` — optional window.
- `ChatHistoryRepository`: conversations counted only when `UpdatedAt` falls inside
  [from, to+1day); feedback counts scoped to the same conversation window.
- `ConversationsController.Usage([FromQuery] DateTimeOffset? from, to)` forwards params.

## Frontend
- `getConversationUsage(options, filters)` appends `from`/`to` query params.
- `ChatStatsDialog` gains a `Dari`/`sampai` date-range row (2 × `type=date` inputs,
  44px, `text-base md:text-sm` for no iOS zoom), a Terapkan button, a Bersihkan button,
  and a period note showing scoped totals vs lifetime. The CSV stats export and all
  summary readouts use `displayUsage = scopedUsage ?? usage`.

## Tests
- 3 repo window tests (from, to, feedback scoping), 1 controller forwarding test.
- 2 historyApi tests (query params present/absent), 3 ChatStatsDialog period tests
  (controls render, scoped fetch renders summary + note, clear restores lifetime).
- 1 deployment guard `ConversationUsage_SupportsADateWindow`.
- Backend 579/579, frontend 853/853, lint + build clean.

## Notes
- The a11y-typography guard flags any editable control missing `text-base` — the two
  date inputs needed `text-base md:text-sm` (16px mobile) or the test failed.
- `vi.hoisted` must be at module top-level, not inside a `describe`, and the mocked
  fn is the destructured value directly (no `.getUsageMock` indirection).
