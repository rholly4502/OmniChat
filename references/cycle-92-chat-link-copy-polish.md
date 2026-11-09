# Cycle 92 — markdown link safety + decoupled copy confirmations (2026-11-09)

Commit `9b93cc6`. Frontend-only chat polish; backend untouched.

## Change
1. **Markdown links open in a new safe tab.** The `ReactMarkdown` component set in
   `MessageList.tsx` only overrode `table`/`img`/`pre`, so a link inside an assistant
   reply navigated the SPA away in the same tab. Added an `a` renderer:
   `a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />`.
2. **Decoupled copy confirmations.** The message-footer copy buttons shared one
   `copiedIndex` state, so copying JSON also flashed the plain-text "Pesan tersalin"
   label on the adjacent button (and vice-versa). Split into `jsonCopiedIndex` and
   `textCopiedIndex` with separate `handleCopyJson`/`handleCopyText` helpers sharing a
   `flashCopy` timer. Both the assistant and user footers updated.

## Tests
- 2 new `MessageList` tests: (1) markdown link renders `target="_blank"` +
  `rel="noopener noreferrer"`; (2) JSON copy shows "JSON tersalin" while the plain
  button stays "Salin pesan" (no bleed-through).
- Frontend **949/949** (was 947), backend **615/615** unchanged, `tsc --noEmit`
  clean, oxlint clean, `vite build` succeeds.

## Verification
- CI + Deploy both green for `9b93cc6` (head_sha match).
- Live bundle `assets/index-Baf-xnGg.js` == local `dist/index.html` byte-identical;
  deployed bundle contains `noopener` + `_blank`.
- `/health` 200 `{"status":"Healthy",...}`; `/api/models` 401 `application/problem+json`.
