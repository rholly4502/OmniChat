# Cycle 59 — Bulk export of all conversations (JSON/CSV) — (2026-11-07)

Commit `e047441`, frontend-only.

## Feature
`ChatStatsDialog` gained "Ekspor semua percakapan" (JSON/CSV) buttons — a
full-history backup/audit, complementing the per-conversation export. It pages
through the entire history and downloads every transcript:
- `historyApi.listAllConversations(options, search?, filters?, pageSize=50)` —
  paginates `listConversations` until a page returns fewer than `pageSize`.
- `conversationExport.buildAllConversationsJson` (one doc: exportedAt + one
  entry per conversation) and `buildAllConversationsCsv` (long-format: one row
  per message with owning conversation, role, content, model, token columns,
  BOM-prefixed).
- Dialog fetches each conversation detail via `getConversation`, skips a
  conversation whose detail fails to load, shows inline error if the whole
  export fails.

## Tests
conversationExport +6 (JSON shape, CSV header/BOM/quoting/total), historyApi +2
(pagination continuation, empty-page stop), ChatStatsDialog +2 (JSON + CSV bulk
export via mocked historyApi/conversationExport). Frontend 802/802, backend
568/568 (untouched), lint + build clean.

## Pitfall — asserting on a shared hoisted mock's `mock.calls[0]`
`downloadBlob` is a module-scope `vi.hoisted` mock shared by ALL tests in
ChatStatsDialog.test.tsx, and the earlier stats-CSV test already calls it once.
Asserting `expect(downloadBlob.mock.calls[0])` after a later click grabs the
*first-ever* call (the older 'statistik-chat.csv'), not the new one. Use a
before/after delta:
```ts
const before = downloadBlob.mock.calls.length;
await waitFor(() => expect(downloadBlob.mock.calls.length).toBe(before + 1));
const [, filename] = downloadBlob.mock.calls[before];
```

## Verification
Live bundle `index-IBiGyovI.js` == local dist hash; live bundle contains
`semua-percakapan` + `Ekspor semua percakapan`; `/health` 200; `/api/models` 401.
