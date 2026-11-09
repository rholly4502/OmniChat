# Cycle 89 — view-transition & dialog-transition guard coverage (2026-11-09)

**Commit:** (TBD) — frontend-only, test guards.

Closes two coverage gaps in the project's own source-level transition guards for the
pixel2 enter-animation contract (stepped `pixel-reveal` panels + `pixel-overlay-fade`
backdrops):

- `view-transition.test.ts`: added the **EventsView** (4th top-level tab) to the guard.
  It already carries the same root contract as JobsView (`h-full flex flex-col min-h-0
  pixel-reveal`), but was unguarded — a future regression could drop its enter animation
  without any test noticing.
- `dialog-transition.test.ts`: added the **ShortcutsDialog** (full-screen modal) to the
  guard — backdrop `bg-chill-bg/60 pixel-overlay-fade` + panel
  `pixel-shadow p-4 space-y-3 pixel-reveal`, same contract as Stats/Audit dialogs, which
  were already guarded.

No component code changed — these are defense-in-depth guards over existing behavior.

## Verification
- `npx vitest run src/__tests__/view-transition.test.ts src/__tests__/dialog-transition.test.ts` → 10/10.
- Full frontend suite → **929/929** (was 926; +3 new assertions). One transient single-test
  flake on a first run, clean on rerun (source-guard tests are deterministic).
- `npm run lint` → clean (one pre-existing JobsView `Date` purity warning, untouched).
- `npm run build` → succeeds.
- Backend `dotnet test tests/OmniChat.Tests -c Release` → **607/607** (unchanged, no backend edits).
- Deploy: push to `main` auto-runs CI → Deploy; verify CI + Deploy rows green and live
  bundle hash matches local `dist/index.html`.
