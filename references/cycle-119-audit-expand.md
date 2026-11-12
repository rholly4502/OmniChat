# Cycle ~119 (2026-11-12) — `03e61b2` audit dialog expandable full-message rows

FE 1074→1077, BE 650/650, lint/build clean, CI+Deploy green, live bundle
`index-BJpWOSiH.js` matches local dist.

Problem: the conversation audit table truncated every message to a 72-char
preview (`preview()`) with the full text available only as a hover `title`
tooltip — inaccessible on touch and keyboard.

Fix: per-row `Lihat lengkap` toggle in `ConversationAuditDialog.tsx`:
- `useState` `expandedRows` map keyed by message index
- button carries `aria-expanded`, pixel chevron rotates (rotate-180)
- expanded row reveals full message content plus its `Cara berpikir` reasoning block
- styled with the chill design tokens (text-chill-accent, active:bg-chill-elevated, focus-visible ring)

Tests (3) in `ConversationAuditDialog.test.tsx`:
1. default truncated preview + toggle presence (aria-expanded=false)
2. expand → full content + reasoning, collapse → preview again
3. CSV export unaffected by expansion state

## Pitfalls
- vitest `getByText('...')` does an EXACT full-text match. The cell renders the
  truncated preview, so anchor the row with a regex:
  `screen.getByText(/Ini adalah balasan yang sangat panjang/)`.
- `getAllByRole('button', {name:'Tampilkan pesan lengkap'})[0]` hits the FIRST
  row (a user message). Scope by row:
  `const row = screen.getByText(/.../).closest('tr')` then
  `within(row).getByRole('button', ...)`.
- react-markdown v10 does NOT fire a `components.text` override (verified via
  `renderToStaticMarkup`). So inline search-term highlighting inside assistant
  markdown replies is not safely implementable via a naive component override —
  it would need a rehype/mdast plugin. This remains a genuine, known limitation.
