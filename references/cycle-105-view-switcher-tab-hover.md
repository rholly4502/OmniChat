# Cycle 105 — view-switcher tab hover/press feedback (2026-11-10)

## Commit — feat(ui): view-switcher tab hover/press surface lifted to chill-elevated

The Sidebar view-switcher tabs (Chat / Pengeluaran / Lowongan / Event) were the
one interactive surface whose hover/press background was `hover:bg-chill-surface`
— the same color as the tablist container itself — so hovering produced **zero
background feedback** (only the text colour changed). Every other tablist in the
app (JobsView, EventsView) lifts to `hover:bg-chill-elevated` on hover/press.

Changed the inactive branch of all four tabs from
`hover:bg-chill-surface … active:bg-chill-surface` to
`hover:bg-chill-elevated … active:bg-chill-elevated`, so the tab now lifts to the
same raised surface as the app's other tab filters. No tokens introduced; no
motion/new animations; reduced-motion unaffected. `border-transparent` left
intact so the invisible 2px accent bar still prevents layout shift on selection.

## Verification

- `tsc --noEmit` clean; oxlint clean; `vite build` succeeds (chunk-size warning pre-existing).
- Full frontend suite green: 63 files, **1000** tests (the Sidebar
  `gives the view-switcher tabs a hard-edged hover/press surface` test was
  updated in the same commit to assert `hover/active:bg-chill-elevated`).
- Backend untouched (pure CSS-class change, no data path).
