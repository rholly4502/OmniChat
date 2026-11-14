# Cycle 138 — unify press interaction: drop the isolated expenses hover-lift (2026-11-14)

**Frontend-only UI/UX pass.** One commit. No backend/data change.

## What & why

An audit of the press micro-interaction across every tab found a genuine
inconsistency: the **expenses/advice tab** carried a two-stage *hover-lift*
(`hover:translate-y-[1px]`) on its action buttons — buttons nudge down 1px on
hover and then 2px on press — while **every other surface** in the app (Chat,
Jobs, Event, Sidebar, dialogs: 125+ press-translating buttons) uses the plain
press-only convention (`active:translate-y-[2px]`, no hover translate).

The hover-lift was introduced deliberately on 2026-11-03 (`df3400e`) but never
propagated; it stayed isolated to ExpensesView/AdvicePanel across ~40 subsequent
cycles, so the de-facto site-wide register is press-only. Because it makes the
expenses tab feel non-uniform (and gives a *shallower* 1px press step than
everywhere else: 1px→2px vs 0px→2px), it is a deviation from the pixel2 press
register that the task asks to keep consistent.

**Fix:** remove `hover:translate-y-[1px]` from all 16 action buttons
(15 ExpensesView + 1 AdvicePanel), leaving the established
`active:translate-y-[2px] active:shadow-none` press step and the hover
background transitions intact. This restores one uniform press language
app-wide.

## Guard

Added a source-level test in `pixel2-press-consistency.test.ts`:
**"press buttons translate only on press (no hover:translate-y divergence)"** —
scans every `<button>` in production source and asserts it never carries
`hover:translate-y`. Pins the press-only register so the isolated hover-lift
cannot silently creep back into any component.

## Verification

- Baseline green: tsc 0 errors, build clean, lint clean.
- `npx tsc --noEmit` → 0 errors.
- Targeted run (9 most-relevant files incl. the new guard, ExpensesView,
  AdvicePanel, and all pixel2/a11y design guards) → **140/140**.
- Broader run (17 files: App, JobsView, EventsView, Sidebar, MobileTopBar,
  MessageList, Composer, ChatHeader, both dialogs, HistoryFilters, transitions)
  → **491/491**.
- Remaining 43 files → **497/497**.
- Full frontend suite: **69/69 files, 1128 tests green** (baseline ~1127 +
  the new guard). No regressions.
- `npm run lint` clean; `npm run build` succeeds (pre-existing chunk-size
  warning only).
- No C# deployment guard references the hover-lift classes
  (`grep translate-y tests/OmniChat.Tests/Deployment/` → empty); frontend-only
  so backend `dotnet test` not required (CI runs it regardless).
