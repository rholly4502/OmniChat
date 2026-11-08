# Cycle 82 — UI polish: focus-ring unification + pending-feature protection (2026-11-08)

Two commits reached `main` this cycle:
- `7e5870f` — `feat(expenses): monthly nabung target progress in advice panel` **[eval auto-commit]**
- `7b31483` — `style(ui): unify focus-visible ring width to ring-2 app-wide` (this cycle's edit)

Both CI green, both Deploy green, live bundle `assets/index-BH1xYuvr.js` matches local `dist/index.html`.

## Pending work found at start (uncommitted) — protected, not re-authored
The working tree carried a complete feature: a monthly-Nabung savings card in
`AdvicePanel` (`monthlyNabung` DTO in `expensesApi.ts` + new `MonthlyNabung`
record in `ExpenseAdvice`/`ExpenseAdviceService`, deposit-only sum excluding spend
patterns) + backend/frontend tests. It built and passed. The pipeline's eval
auto-commit (`7e5870f`) swept it before I could commit — the work is safe and
verified. My role was to verify it, not rewrite it.

## This cycle's actual edit — focus-ring consistency
Five controls used `focus-visible:ring-1` while every other focus-visible in the
app used `ring-2` (inconsistent indicator clarity, a WCAG focus concern):
- `Sidebar.tsx` (dropdown item + settings textarea)
- `ChatHeader.tsx` (export menu item)
- `HistoryFilters.tsx` (reset link)
- `MessageList.tsx` (message action button)

All harmonized to `focus-visible:ring-2`. Verified zero `ring-1` remain.

## Verification
- Backend: **599/599** tests, build 0 warnings (feature commit).
- Frontend: **900/900** tests across 61 files, `tsc --noEmit` clean,
  `npm run build` clean. Targeted rerun of Sidebar/MessageList/HistoryFilters/App: 225/225.
- Live: bundle hash matches, `/health` → 200 `application/json` Healthy,
  `/api/models` → 401 (auth working).
- `origin/main` = HEAD, `git rev-list --count origin/main..HEAD` = 0.

## Pitfalls (would have cost a cycle)
- **Stale vitest failure from orphaned runs.** Two foreground `vitest run`
  calls "timed out" at the tool level but left orphan processes running in
  parallel with the real background run, slowing it to ~8 min and producing a
  bogus failure log (`multiple elements /kurang/`) that did NOT reproduce on a
  clean single run. Lesson: `pkill -9 -f "vitest[ ]run"` before starting a
  background suite; a full `vitest run` here takes ~7–8 min, so poll, don't
  trust the first log.
- **`gh` is not authenticated in this sandbox.** Use the public workflow API
  instead: `repos/rholly4502/OmniChat/actions/runs` to confirm CI+Deploy
  `completed/success`. Deploy runs in parallel with CI; check both.
- **`git pull --rebase` refuses with unstaged changes.** Commit before rebase.
  the untracked `ShortcutsDialog.tsx` does not block rebase.

## Leftover noted (not wired, out of scope)
`frontend/src/components/ShortcutsDialog.tsx` remains **untracked and unreferenced**
— a complete, accessible pixel-themed keyboard-shortcut dialog (`useModalDialog`
contract) with no trigger wired into the UI. Left uncommitted to avoid adding dead
code; it belongs to the ongoing keyboard-shortcuts thread, so wire it in a
dedicated feature cycle, or delete it.
