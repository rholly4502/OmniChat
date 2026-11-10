# Cycle 104 — view-switcher tablist WAI-ARIA keyboard navigation (2026-11-10)

## Commit — feat(ui): view-switcher tablist WAI-ARIA keyboard navigation

`b389342`. The sidebar view-switcher (`role="tablist"` / `role="tab"` with
`aria-selected`) was the one interactive surface that did not yet implement
the WAI-ARIA tabs pattern: all four tabs were Tab-reachable and there was no
arrow-key support. Added:

- **Roving tabindex** — only the selected tab is `tabIndex={0}`; the others
  are `-1`. Tab lands on the active view, matching `aria-selected`.
- **Arrow/Home/End navigation** on the tablist container (`ArrowRight` /
  `ArrowLeft` wrap, `Home`/`End` jump), moving both selection (via the
  existing `onSelectView`) and DOM focus (via a ref array).

No visual tokens changed; no motion added; reduced-motion unaffected.

## Verification

- `tsc --noEmit` clean; oxlint clean; `vite build` succeeds.
- Full frontend suite green: 63 files, **996** tests (995 → 996 with the new
  `Sidebar view-switcher keyboard navigation` test; all pixel2/a11y guards
  still pass).
- Backend untouched this cycle.
