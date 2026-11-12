# Cycle 123 — JobsView disabled-state contrast (2026-11-12)

Commit `7eac2d3`. Frontend-only; backend untouched. CI + Deploy green; live bundle
`index-CHGS84a2.js` matches local dist.

## Gap found
`JobsView.tsx` has four action buttons that use the `disabled` prop, but the
disabled state was either missing or misleading:
- The follow-up **Simpan** button had *no disabled visual at all* — it kept its
  full accent hover/press styling while disabled, so an inert button still looked
  and felt pressable.
- The other three (status pills, generate-draft, open-lowongan-after-gate) had a
  dimmed disabled branch, but all still carried the base
  `active:translate-y-[2px]` press-slide — so a disabled button visibly pressed
  down, giving false feedback.

## Fix
Aligned with the codebase's established disabled convention (`disabled:opacity-50
disabled:cursor-not-allowed`, as in Composer send / ExpensesView):
- **Simpan** button gains `disabled:opacity-50 disabled:cursor-not-allowed
  disabled:hover:bg-chill-accent/10 disabled:active:bg-chill-accent/10
  disabled:active:translate-y-0` (hover/press shades neutralized while disabled).
- All four buttons gain `disabled:active:translate-y-0` so the press-slide
  never fires on a disabled control. Harmless when enabled (`:disabled` never
  matches an enabled button).
Only existing chill tokens and utility vocabulary; no new colors/corners/animation.

## Regression guard
3 new tests in `JobsView.test.tsx` (under "JobsView disabled-state contrast"):
- status pills are `disabled` + carry `disabled:active:translate-y-0` + `cursor-wait` while a status update is in flight;
- generate-draft button likewise while generating;
- Simpan button is `disabled` and carries `disabled:opacity-50` + `disabled:cursor-not-allowed` + `disabled:active:translate-y-0` while a save is in flight.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1087 passed, 65 files
- `npm run lint` (oxlint) → clean
- `npm run build` → success (chunk-size warning pre-existing/benign)
- CI + Deploy rows green for `7eac2d3`; live `index-CHGS84a2.js` matches local dist; `/health` → Healthy.
