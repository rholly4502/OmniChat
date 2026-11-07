# Cycle 57 — Unify full-page loaders on the shared pixel-scan ScanLoader (2026-11-07)

**Commit `79bfcbe`**, CI + Deploy both green, live bundle hash matches local dist.

## What changed (pure frontend UI polish)
- New `frontend/src/components/ScanLoader.tsx`: a row of hard-edged squares that
  sweep a single highlight left→right via the existing `pixel-scan` stepped
  animation (same language as the chat typing indicator). Decorative
  (`aria-hidden="true"`); pair with a `role="status"` paragraph for the text.
  Reduced-motion falls back to the global `prefers-reduced-motion` media block.
- `JobsView.tsx` and `ExpensesView.tsx` full-page loading states now use
  `<ScanLoader />` instead of a lone `pixel-blink` square — one loader language
  across the chat / expenses / jobs tabs.

## Verification
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: **789/789** (added a 3-test `ScanLoader.test.tsx` suite)
- `npm run lint`: clean (oxlint)
- `npm run build`: succeeds (bundle `index-1ER0mRkY.js`)
- `dotnet test tests/OmniChat.Tests -c Release`: **566/566**
- CI (79bfcbe) completed success; Deploy (79bfcbe) completed success
- Live bundle `assets/index-1ER0mRkY.js` == local `dist/index.html` exactly

## Pitfall — decorative `<span>` loader blocks carry no `rounded-none`
An early version of the `ScanLoader.test.tsx` asserted each block's className
contained `rounded-none`. That failed: the blocks are decorative `<span>`s (not
buttons), so they follow `TypingIndicator`'s existing register — `w-2 h-2
bg-chill-accent pixel-scan`, no `rounded-none`. The `rounded-none` floor in
`pixel2-consistency.test.ts` applies to `<button>`s only. Relaxed the test to
assert the accent register instead of forcing a pointless class.
