# Cycle 100 — pixel loading feedback on ChatStatsDialog async buttons (2026-11-11)

## Commit `065ff7d` — feat(ui): pixel loading feedback on ChatStatsDialog async buttons

The stats dialog's async buttons reported busy only by swapping their text label
(`Memuat…` / `Mengekspor…`). Now they also show the shared pixel `ScanLoader`
(square `pixel-scan` sweep, `aria-hidden`, reduced-motion-safe via the global
media block). Scope: the apply-range button and the two bulk-export buttons —
the three controls that go through an async round-trip.

- `frontend/src/components/ChatStatsDialog.tsx`: import `ScanLoader`; each busy
  label becomes `<ScanLoader blocks={4} /> <span>…</span>` inside the existing
  `inline-flex` button (spacing preserved, no layout shift).
- `frontend/src/__tests__/ChatStatsDialog.test.tsx`: new test gates
  `getUsageMock` on a never-resolving promise and asserts the apply button holds
  a `.pixel-scan` element + "Memuat" while scoped fetch is pending, then
  resolves.

## Verification
- Frontend: `npx tsc --noEmit` clean; `npx oxlint` clean; `npm run build` OK;
  `vitest run` **1042/1042** (was 1041). ChatStatsDialog suite 18/18.
- Backend: not touched. NOTE — at run time the working tree held *uncommitted*
  backend work from a parallel agent (`LamaranDraftService.cs`, edits to
  `JobsController.cs`/`IOpportunityRepository.cs`/`Program.cs`) that at the
  moment of this run did not compile (`HermesOptions` not yet defined). Those
  files are not part of this commit; CI for `065ff7d` runs against clean
  `origin/main` + frontend change and is green.
- CI green, Deploy green (verified via GitHub API). Live bundle
  `index-u36H0NcV.js` == local `dist/index.html` byte-identical; contains
  `pixel-scan`.

## Lesson
A parallel agent's in-progress backend edits can sit uncommitted in the shared
working tree and break `dotnet build` even though the pushed commit is clean.
Commit only scoped paths (`git add <files>`), never `git add -A`, and rely on
the CI result for the pushed commit — not on a local backend build that is
contaminated by the other agent's unfinished work.
