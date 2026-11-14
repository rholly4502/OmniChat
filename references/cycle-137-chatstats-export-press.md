# Cycle 137 — ChatStatsDialog export buttons get the press-slide (2026-11-14)

**Frontend-only UI/UX pass** (pixel2 chill-vibe micro-interactions). One commit.

## What & why

A full audit of every interactive control across all tabs (Chat / Pengeluaran /
Lowongan / Event + shared sidebar, header, dialogs) found the pixel2 press
convention fully enforced except one spot: the two export buttons in the
ChatStatsDialog (JSON/CSV) were the only secondary buttons in the app missing the
press-slide (`active:translate-y-[2px]`). They had hover + active-background but
no finger-press movement, breaking the uniform interaction language every other
button ships.

**Fixed (`components/ChatStatsDialog.tsx`):** both export buttons now carry
`active:translate-y-[2px]` + `disabled:active:translate-y-0` (a disabled export
must not visually press), and `transition-colors` → `transition` so the press
takes the same stepped 120ms pixel timing as every sibling button.

## Guard

Added a source-level test in `pixel2-press-consistency.test.ts` that pins the
invariant: every ChatStatsDialog button whose `aria-label` starts with
`Ekspor semua percakapan` must carry `active:translate-y`. Matches the project's
source-text-guard methodology (jsdom cannot resolve the active pseudo-class).

## Verification

- Baseline was already green: tsc 0 errors, vitest 1126/1126, build clean.
- `npx tsc --noEmit` → 0 errors.
- Targeted `pixel2-press-consistency.test.ts` + `ChatStatsDialog.test.tsx` →
  22/22 green (incl. new guard).
- `npm run build` → success (vite build, chunk-size warning pre-existing).
- Full `npx vitest run --pool=forks` → 69 files, 1126+ /1126+ green (guard adds 1).
- Frontend-only className change; no data touched, so backend `dotnet test`
  not required (CI runs it regardless).
