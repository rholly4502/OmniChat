# Cycle 84 — EventsView loading parity with shared ScanLoader (2026-11-08)

**Commit `acfa1de`** — CI + Deploy green, live bundle hash matches local dist.

## What & why
The three "Cron-driven" tabs (Events, Jobs, Expenses) are visual siblings. JobsView and
ExpensesView already use the shared stepped loader `<ScanLoader />` (pixel-scan) for their
full-page `role="status"` loading rows; EventsView was the lone straggler still using an
inline single `pixel-blink` square. Unifying EventsView onto `<ScanLoader />` restores cross-tab
loading consistency (the theme's established loader language) with a purely presentational change.

## Change
- `frontend/src/components/EventsView.tsx`: import `<ScanLoader />`, replace the inline
  `pixel-blink` span in the loading row with `<ScanLoader />` (keeps the `role="status"`
  live region + "Memuat event…" label).
- `frontend/src/__tests__/EventsView.test.tsx`: new regression test — loading state renders
  `role="status"` containing the label, a `.pixel-scan` loader, and **no** `.pixel-blink`.

## Verification
- `npx tsc --noEmit`: 0 errors.
- Frontend `npx vitest run`: **912/912** pass across 62 files (suite takes ~9.5 min under
  jsdom; the earlier "hang" was just scale — use `--reporter=dot` + background + file tail).
- `npm run build`: succeeds (pre-existing chunk-size warning only).
- Backend `dotnet test tests/OmniChat.Tests -c Release`: **601/601** pass (no backend change).
- CI + Deploy both `completed success` for `acfa1de`; live bundle `assets/index-vBhGV-wD.js`
  == local `dist/index.html` hash exactly; `Memuat event` label present live.

## Notes
- The `pixel-blink` square remains correct for its other contexts (TypingIndicator chat
  pulse, AdvicePanel "Menganalisa…" button, BackendStatus status dot) — only the full-page
  loader row was the inconsistency.
- Stash safety: this run found pre-existing unstaged backend WIP in `ExpenseAdviceService`
  (Tagihan rent-day exclusion + 2 tests). It was stashed as `stash@{0}` (message: "WIP:
  expense advice Tagihan exclusion") to keep this frontend-only commit clean. It is NOT part
  of this commit and remains in the local stash for the owner to review/commit.
