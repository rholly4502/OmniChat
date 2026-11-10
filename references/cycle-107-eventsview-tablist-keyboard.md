# Cycle 107 — EventsView filter tablist: WAI-ARIA roving-tabindex keyboard nav

**Date:** 2026-11-10 · **FE:** EventsView app-filter pills

## What
Cycle 106 brought WAI-ARIA roving-tabindex keyboard nav to JobsView's three filter
tablists and explicitly deferred EventsView's app-filter tablist (`role="tablist"`
aria-label "Filter aplikasi") to a future cycle. This cycle closes that gap:

- Only the selected pill stays in the tab order (`tabIndex={active ? 0 : -1}`);
- `ArrowLeft`/`ArrowRight`/`Home`/`End` move focus **and** selection;
- Tab still reaches exactly the selected pill; arrows then move within it.

## Implementation
- Same module-level pure helper `nextTabIndex(keys, current, key)` as JobsView (no
  DOM/ref access → free of the `react(refs)` lint rule).
- `appKeys = ['', ...apps]` — "Semua" (empty key) first, then one pill per app in
  render order. `appTabRefs` refs are referenced inside the `handleAppKeyDown`
  handler body, not in JSX (mirrors the cycle-106 pitfall: never build `onKeyDown`
  via a factory that takes refs as arguments).

## Tests
`EventsView.test.tsx` — 6 new tests (1013 → 1019 frontend total): roving tabindex;
ArrowRight selects+focuses next pill; ArrowLeft wraps from Semua to last; Home/End
jump; ArrowRight wraps from last to Semua; non-navigation keys (Tab) don't call the
setter.

## Pitfall — mocked-hook filter state doesn't re-render
EventsView's `appFilter` comes from the *mocked* `useEvents` hook, so `setAppFilter`
being a `vi.fn()` never re-renders — asserting DOM `aria-selected` after a keydown
fails because the component cannot reflect a state update that isn't driven by React.
JobsView tests assert on DOM because its `typeFilter`/`tierFilter` are internal
`useState`. Here the correct test seam is to assert the setter is called with the
expected next key **and** that focus moved (refs are independent of state).

## Verification
- `npx vitest run src/__tests__/EventsView.test.tsx` → 11 passed
- `npm run test` → 1019 passed (was 1013)
- `npm run lint` → clean, 0 warnings
- `npm run build` → success
- Backend untouched (624/624); no C# deployment guard reads EventsView source.

## Deploy status
Pushed to `main`. Note: the VPS SSH deploy outage (cycle 106) may still block
Deploy; feature is committed on `main` and goes live once SSH is reachable.
