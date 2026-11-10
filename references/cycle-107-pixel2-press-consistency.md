# Cycle 107 — pixel2 press-shadow consistency (2026-11-10)

## Commit — feat(ui): pixel-shadow buttons drop their shadow on press (active:shadow-none)

The pixel2 press convention is: a button carrying a hard offset shadow
(`pixel-shadow` / `pixel-shadow-sm`) that slides down on press (`active:translate-y`)
must also drop that shadow (`active:shadow-none`) so it reads as physically
grounded. Three buttons violated it — they had the shadow and press slide but
kept the shadow floating, so the press looked flat.

Fixed (all now match the sibling convention `active:translate-y-[2px] active:shadow-none`):
- `MessageList.tsx` — the quick-start suggestion chips (`onSelectSuggestion`) lacked
  both the slide and the shadow-drop.
- `Sidebar.tsx` — "Muat lebih banyak" (load-more) had the slide but not the shadow-drop.
- `Sidebar.tsx` — "Statistik Chat" button lacked both.

## Regression guard

New `src/__tests__/pixel2-press-consistency.test.ts`: every `<button>` carrying
`pixel-shadow`/`pixel-shadow-sm` AND `onClick` must include `active:shadow-none`.
Uses the same robust `buttonTags` open-tag scanner as `pixel2-consistency.test.ts`
(brace-depth + quote aware). This pins the convention app-wide so a future
shadow button can't drift again. Frontend 1020 tests (64 files), +3 from the new guard.

## Verification
- `npx tsc --noEmit` 0 errors; `npm run lint` (oxlint) clean.
- `npx vitest run` — **1020/1020** passed (64 files).
- `npm run build` — succeeds (pre-existing chunk-size warning only).
- `dotnet test tests/OmniChat.Tests -c Release` — **624/624** passed (pure CSS-class
  change, no data path; backend guards still green).
- Pre-commit scan confirmed **0** remaining pixel-shadow+onClick buttons missing
  `active:shadow-none` across all component source.
