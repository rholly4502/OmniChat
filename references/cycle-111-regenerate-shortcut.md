# Cycle 111 — Alt+R regenerate keyboard shortcut (2026-11-11)

Commit `dd85358`, CI green, Deploy green (both on `dd85358`), live bundle
`index-DxORBllH.js` matches local `dist/index.html` hash exactly.

## What shipped

The one core chat action with no keyboard shortcut — regenerate/`Coba lagi` —
now binds `Alt+R`:

- `frontend/src/hooks/useChatShortcuts.ts`: new optional `onRegenerate` callback,
  bound to `Alt+R` (no Ctrl/Shift, guarded by the typing-target + modal-open
  checks like every other shortcut).
- `frontend/src/App.tsx`: wires `onRegenerate={() => { if (!streaming) void regenerate(); }}`.
- `frontend/src/components/ShortcutsDialog.tsx`: new row `Alt + R — Coba lagi
  (regenerate jawaban terakhir)`.
- Tests: +3 in `useChatShortcuts.test.tsx` (fires on Alt+R; not on plain R /
  Ctrl+R / Ctrl+Alt+R; not while a dialog is open), +2 assertions in
  `ShortcutsDialog.test.tsx`. Frontend 1045 → 1048. Lint + build clean.

## Why Alt+R

`Ctrl+R` is the browser reload (must never hijack it), and `Ctrl+Alpha+R` is
the hard-reload as. `Alt+R` is unused by the browser, so it is the safe,
mnemonic (R = regenerate) binding consistent with the existing `Ctrl+Alt+C`
copy-transcript family.

## Verification

- FE 1048/1048 (64 files), build clean, oxlint clean. No backend changes.
- Live bundle hash == local dist hash; `/health` 200 JSON `{"status":"Healthy"}`;
  `/api/models` 401. Dialog copy `Coba lagi (regenerate jawaban terakhir)` present
  in the live bundle; `onRegenerate` appears ≥1× in the deployed JS.
