# Cycle 67 — mobile access to the aggregate chat stats dialog (2026-11-07)

**Commit `586e3a0`**, CI green + Deploy green (verified via public API: both runs
`conclusion: success`), live bundle `assets/index-Ct1IDVur.js` matches local
`frontend/dist/index.html` byte-for-byte.

## Gap
ChatStatsDialog (per-model token/cost breakdown across all conversations) was
only reachable from the desktop `ChatHeader`, which is `hidden md:flex`. Mobile
users saw the live token/cost readout in `MobileTopBar` but had no path to the
breakdown. (The per-conversation audit dialog already had a sidebar-drawer route,
so only the stats dialog was orphaned on mobile.)

## Change
- `MobileTopBar` gains an optional `onOpenStats?: () => void` prop. When wired,
  the cost readout renders as a `<button>` (`aria-haspopup="dialog"`, keyboard
  focusable, `min-h-[44px] min-w-[44px]` touch floor) that opens the stats
  dialog; when absent (guest, or unwired) it stays the non-interactive `<span>`.
- `App.tsx` admin mobile bar wires `onOpenStats={() => setStatsOpen(true)}`
  (guest branch untouched — guest must not see aggregate usage).

## Tests
`MobileTopBar.test.tsx` +2: tapped cost chip fires `onOpenStats`; unwired
readout stays a `SPAN`. Frontend **846 → 848**, backend **578/578**, lint/build
clean.

## Pitfall
Two byte-identical cost-readout spans exist in `MobileTopBar.tsx` (guest and
admin branches). When targeting one with a string replace, anchor on the unique
trailing context — the admin one is followed by `</>` then
`) : activeView === 'expenses'`; the guest one by `</div>`. Asserting
`count == 1` on the anchored block prevents editing the wrong branch.
