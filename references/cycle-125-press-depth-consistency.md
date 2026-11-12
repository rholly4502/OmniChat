# Cycle 125 — ExpensesView transaction-row press depth consistency (2026-11-12)

Commit `ab1d474`. Frontend-only; backend untouched. CI + Deploy green; live bundle
hash matches local dist.

## Gap found
A cross-tab audit of the pixel2 press language found one drift: the four transaction-row
action buttons in `ExpensesView.tsx` (edit / delete / "Yakin?" confirm / cancel) pressed
`active:translate-y-[1px]` — a shallower press than every other button in the app and in
the same file. Every other control uses `active:translate-y-[2px]` (icon/standard) or
`[3px]` (primary CTA). A 1px press is a valid Tailwind class, so it rendered fine and
slipped past every rendered test, but it felt different from every other control. The
file's own register is `hover:translate-y-[1px]` (subtle lift) + `active:translate-y-[2px]`
(press), so the four transaction buttons were also internally inconsistent (1px/1px).

## Fix
Normalised the four transaction-row buttons to the file's own standard:
`hover:translate-y-[1px] active:translate-y-[1px]` → `hover:translate-y-[1px] active:translate-y-[2px]`.
Only existing utility vocabulary, no new tokens/colors/animation.

## Regression guard
New test in `pixel2-consistency.test.ts` ("never uses the 1px press depth (active must be
2px or 3px)") scans every shipped source file and bans `active:translate-y-[1px]`. This
pins the press language so the drift cannot recur. Pitfall: the guard must live inside the
`pixel2 chill consistency` describe (which defines `files`), not the expenses-empty-state
describe — `files` is block-scoped and not visible there (ReferenceError).

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1102 passed, 66 files
- `npm run lint` (oxlint) → clean
- `npm run build` → success (chunk-size warning pre-existing/benign)
- `dotnet test tests/OmniChat.Tests` → 657 passed, 0 failed (deployment guards that read
  `ExpensesView.tsx` assert on feature strings — export/delete/form labels — untouched)
- CI + Deploy rows green; live bundle hash matches local dist; `/health` → Healthy.
