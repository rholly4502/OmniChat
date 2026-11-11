# Cycle 114 — JobsView CV download button touch-target fix (2026-11-11)

**Commit `f4532c1`** (frontend), CI green. Deploy needed a rerun at the SSH stage
(known transport flake) — see final report for live state.

## What
A source-wide sweep for sub-44px interactive controls found exactly one violation of the
pixel2 touch floor: the **CV download chip** in `JobsView.tsx` carried `min-h-[36px]` at
every breakpoint, while every sibling control (filter toggle, chips, action buttons) meets
44px. It had escaped because the existing 44px floor guard in
`pixel2-consistency.test.ts` was scoped to `ExpensesView`/`AdvicePanel` only.

- `JobsView.tsx`: CV download button `min-h-[36px]` → `min-h-[44px]` (touch floor).
- `pixel2-consistency.test.ts`: new guard — every JobsView `<button>` referencing
  `downloadCv` must carry `min-h-[44px]`, so this class of gap cannot regress.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → **1055/1055** pass (64 files), incl. the new guard.
- `npm run lint` clean; `npm run build` success.
- Backend untouched (no C# change); no backend test references the edited strings.

## Note
The `MessageList` copy button's `md:min-h-[28px]` is intentional desktop-compact design
with a 44px mobile base and was left as-is.
