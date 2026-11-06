# Cycle 47 — global chat keyboard shortcuts (2026-11-06)

Commit `f3da539`. Frontend 738 → 752 tests; backend 533/533; lint/build clean; CI + Deploy green; live bundle `index-gNp73YKl.js` matches local dist byte-identical.

## What shipped
Global keyboard shortcuts for the chat workspace:
- `/` or `Ctrl+K` → focus the composer textarea
- `Ctrl+Shift+F` → open the in-transcript search toolbar
- `Ctrl+N` → start a new chat (admin only; guests have no sessions)

New `frontend/src/hooks/useChatShortcuts.ts` (76 lines). Guards: ignored while typing in an input/textarea/select/contentEditable, and while any `[role="dialog"]` is in the DOM (drawer open, stats/audit modals) — so it never hijacks keystrokes meant for a modal or the export menu.

Wiring:
- `Composer` gained optional `inputRef?: React.RefObject<HTMLTextAreaElement | null>` prop; used when provided (falls back to internal ref).
- `MessageList` gained `searchSignal?: number`; nonzero change is a rising edge that opens the search toolbar (0 ignored).
- `App.tsx` holds `composerRef` + `searchSignal` state and calls `useChatShortcuts`.

## Test coverage
- `useChatShortcuts.test.tsx` (7 tests): `/`, Ctrl+K, Ctrl+Shift+F, Ctrl+N, typing-target suppression, dialog-open suppression, non-matching keys ignored.
- `App.test.tsx` (4 new): Ctrl+Shift+F opens search; `/` and Ctrl+K focus composer; Ctrl+N clears the transcript.
- `MessageList.test.tsx` (3 new): searchSignal opens toolbar, zero signal doesn't, reopens after close+increment.

## Pitfalls
- **Gate the Ctrl+N test on the Send button reappearing, not bubble count.** After a 401 stream error the 2 bubbles (user + assistant error) exist while `streaming` is momentarily still true, so `handleNewSession`'s `if (streaming) return` guard bails and the transcript never clears. Wait for `screen.getByRole('button', { name: 'Kirim' })` (Send swaps to Stop while streaming).
- **App-level shortcut tests must `waitFor`.** Firing the key and asserting synchronously sees stale state; React needs a tick. Wrap assertions in `waitFor`.
- **The secret scanner masked `apiKey` as `***`** in the useServerHistory grep (`{ apiKey: *** || undefined }`) — that's the scanner, not a codebug. Verify with grep/wc -c, not eyeballing.
- Minified bundle drops `useChatShortcuts` identifier — verify deployment by bundle-hash match + workflow head_sha, not by grepping minified output for the function name.
