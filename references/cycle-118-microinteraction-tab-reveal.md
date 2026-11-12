# Cycle 118 — leftover-WIP rescue + tab-entrance animation consistency (2026-11-12)

Two commits, both pushed, both verified live (bundle hash match).

## `92ada6b` feat(advice): rescue of interrupted-cycle WIP
Found uncommitted, coherent work sitting in the tree (from a prior interrupted cycle):
the AdvicePanel habit-level daily-food comparison. Verified sound first, then committed
as its own focused commit so it was not lost:
- Backend: `AvgDailyMakan` (Makan total / elapsed days) added to `DailySuggestions` DTO.
- Frontend: `expensesApi.ts` type + AdvicePanel red/sage banner when avg > plan max.
- Tests: backend ExpenseAdviceServiceTests 45/45, frontend AdvicePanel 48/48.

## `68b3a15` feat(ui): pengeluaran view entrance animation
Inconsistency found: Chat, Jobs, and Events views all mount with the `pixel-reveal`
stepped fade/slide-in on tab switch; ExpensesView was the only tab without it, so it
swapped in instantly next to animated neighbours. Added `pixel-reveal` to ExpensesView's
root div. Reduced-motion-safe: the global `prefers-reduced-motion` block collapses
animation to ~0ms/1 iteration, so it lands instantly on the visible state.

## Verification
- Frontend: `tsc --noEmit` 0 errors; `vitest run` **1074/1074** (65 files); `npm run build` OK.
- Backend: `dotnet test` **650/650**.
- Live: `/health` → Healthy; bundle `index-1quIxyNB.js` matches local `dist/index.html`
  after the deploy caught up (~150s). Deploy auto-triggered on push.
- `deploy-vps.sh` (untracked host-side helper) left untouched — not committed.
