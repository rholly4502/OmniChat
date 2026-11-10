# Cycle 106 — JobsView filter tablists: WAI-ARIA roving-tabindex keyboard nav

**Date:** 2026-11-10 · **FE:** job view filter pills super

## What
The JobsView filter groups (`Filter posisi`, `Filter status`, `Filter prioritas`) used
`role="tab"` / `aria-selected` on `<button>`s but had **no keyboard pattern**, the
only tablist in the app with real nav. The top-level view-switcher in Sidebar got the
WAI-ARIA Tabs treatment in cycle 104/105 (roving tabindex + ArrowLeft/Right/Home/End).
This cycle brings the three filter tablists to the same pattern:

- Only the selected tab in each group stays in the tab order (`tabIndex={active ? 0 : -1}`);
- `ArrowLeft`/`ArrowRight`/`Home`/`End` move focus **and** selection (matches the
  view-switcher semantics — arrows select, they don't toggle like a mouse click does);
- Tab still reaches exactly the selected tab per group; arrows then move within it.

## Implementation
- Pure module-level helper `nextTabIndex(keys, current, key)` returns the next index
  (`-1` for non-navigation keys → callers bail without `preventDefault`, so Tab still
  works). No DOM/ref access → stays free of the `react(refs)` lint rule.
- Three explicit `handle*KeyDown` handlers in the component body reference their own
  refs internally (`typeTabRefs` / `statusTabRefs` / `tierTabRefs`), mirroring how
  Sidebar's `handleViewSwitcherKeyDown` reads `viewTabRefs`.
- `nextTabIndex` helpers are computed at module scope from the existing filter constants.

## Pitfall — `react(refs)` lint rule vs. a render-time factory
Building `onKeyDown` via a factory that *takes the refs as arguments* — whether inline
in JSX or as a component-body variable — trips oxlint's `react(refs)`
("Cannot access refs during render"), because the rule cannot prove the callee only
dereferences `.current` inside an event handler. The clean form mirrors Sidebar:
reference the refs inside the event-handler function body, pass only the handler to JSX.
(For the record: lint warns but exits 0; the codebase bar is zero warnings anyway.)

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **1013 passed** (was 1008; +5 new JobsView keyboard-nav tests)
- `npm run lint` → clean, 0 warnings
- `npm run build` → success
- `dotnet test tests/OmniChat.Tests -c Release` → **624/624 passed** (no backend change;
  no C# guard reads JobsView source)

## Scope note
EventsView also has a `role="tablist"` filter group with the same gap; left for a
future cycle to keep this one surgical. JobsView's three groups are the unit here.

## Deploy status (2026-11-10, 20:50 UTC)
Pushed to `main` (`038ffa4f`). **CI green**, but the **Deploy to VPS** workflow is
red — and has been for the last 5 pushes (including `3119711f`, `55101d05`,
`e73da6e6`, `5cc87416` before this cycle). The `Deploy via SSH` step fails after
exactly ~20s, which equals the ssh `ConnectTimeout=20`, i.e. the VPS SSH endpoint is
currently unreachable from GitHub Actions runners (a transport/network outage, not a
code failure). Feature is committed on `main` but **not yet live** (live bundle still
serves the previous build). It will deploy automatically once the VPS SSH is reachable
again and the next push/rerun goes through.
