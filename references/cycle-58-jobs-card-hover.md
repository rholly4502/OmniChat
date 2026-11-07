# Cycle 58 — job-opportunity card hover micro-interaction (2026-11-07)

**Commit `d092b3c`** (polish) + this archive doc. Frontend-only.

## Change
The job-opportunity card in `JobsView.tsx` (a grouped `<li>` that holds the
role title, meta, and the "Lihat lowongan" action) was an interactive surface
with no hover feedback — the same gap cycle 53 closed for expense transaction
rows. In a long list this made locating a card's group/action visually silent.

Applied the app's established pixel interaction register to the card `<li>`:

```
transition hover:bg-chill-elevated
```

Same `chill-elevated` surface tone used by every other hoverable surface,
hard-edged, stepped by the global `steps(2, jump-none)` transition rule, and
auto-disabled under `prefers-reduced-motion`. No new tokens, no new radii, no
shadow changes.

## Test
New `JobsView.test.tsx` describe asserts every opportunity-card `<li>` in the
grouped list carries `transition` + `hover:bg-chill-elevated`, so a future
refactor can't silently drop the micro-interaction again.

## Verification
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: **796/796** (was 795, +1 guard)
- `npm run lint`: clean (oxlint)
- `npm run build`: succeeds (bundle `index-BjcU_iO9.js`)
- Backend untouched (no data-shape change; no `dotnet test` needed)
- CI + Deploy verified on push to `main` (see commit status)

## Lesson
Matches cycle 53: the guards enforce the design floor, not the presence of
individual micro-interactions. Audit each interactive surface for the
hover/transition language explicitly — job cards were fully "compliant" yet
still lacked hover feedback.
