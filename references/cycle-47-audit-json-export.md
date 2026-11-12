# Cycle 47 — audit JSON export (2026-11-12) — commit `b0d7679`

Frontend 1064 → 1066, backend 648/648, lint/build clean, live bundle `index-CAbSOltf.js` matches dist.

## Change
`ConversationAuditDialog.tsx` previously exported per-conversation audit data as CSV only.
Added a **JSON export** button (aria-label `Ekspor audit sebagai JSON`, pixel icon) producing
`{slug}-audit.json` via new `buildAuditJson` — lossless counterpart to `buildAuditCsv`:
- per-message rows: no/peran/pesan/model/prompt_tokens/completion_tokens/biaya_usd/umpan_balik/berpikir/ditandai/waktu
- top-level: judul/model/mode/dibuat/diperbarui, `total` (prompt+completion+biaya_usd), `per_model` subtotals

Consistent with the header/global export surfaces which already offered JSON.

## Verification
- `npx vitest run src/__tests__/ConversationAuditDialog.test.tsx` — 18/18 (2 new)
- Full frontend suite 1066 passed; lint clean; build clean
- No backend DeploymentConfigTests guard references the audit dialog (grep verified)
- Live: bundle hash == local dist, `/health` healthy, `/api/models` 401
- Bundle contains `Ekspor audit sebagai JSON` and `audit.json` (x1 each)

## Pitfalls
- `gh run list` returns empty output in this sandbox (segfaults) — verify deploy only via
  live bundle hash vs local `dist/index.html`, `/health`, and `/api/models` status codes.
- Writing tests: `downloadBlob` mock accumulates across tests in the file — call
  `downloadBlob.mockClear()` at the top of each test that asserts call counts.
- A `sed -i` global replace of `renderOpen(vi.fn(), rich)` overreached into an earlier
  describe's session — restore those two references back to `rich` (scoped fixture) and
  only let the new describe use its own `jsonRich` fixture.
