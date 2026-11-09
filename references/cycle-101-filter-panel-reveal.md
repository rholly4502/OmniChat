# Cycle 101 — disclosure-panel enter animation consistency (2026-11-09)

## Commit — style(ui): pixel-reveal enter on the collapsible filter panels
The Filter disclosure groups in **JobsView** (`#jobs-filters`) and **EventsView**
(`#events-filters`) toggled open with zero animation while their chevron
already rotated (stepped `transition-transform duration-150 steps(3)`). That is
a mismatch against the app-wide pixel reveal language every other expanding
surface uses (`pixel-reveal`: stacked panels, reasoning block, export menus,
chat view switch). Added the existing `pixel-reveal` class to both panel
containers so expand/collapse now fades/slides in in the same two-step beat.
- Purely additive class, no logic/state change (still `{open && …}`).
- Reuses the existing `pixel-reveal` token — no new color/corner/motion.
- Reduced-motion covered by the global `prefers-reduced-motion` media block
  (duration → ~0, element lands visible immediately).
- The in-transcript search bar (MessageList) was intentionally left as-is: it
  is a sticky auto-focused toolbar, not a disclosure panel, so an enter
  animation adds no value there.

## Verification
- `tsc --noEmit` clean; oxlint clean; `npm run build` succeeds.
- Frontend suite green (chunked `--pool=forks`, 4 runs): 63 files, **741**
  tests passed — incl. `JobsView.test.tsx`, `EventsView.test.tsx`,
  `view-transition.test.ts`, `pixel2-consistency.test.ts`.
- Backend `dotnet test tests/OmniChat.Tests -c Release`: **619/619** passed
  (no deployment guard reads these two class strings).
