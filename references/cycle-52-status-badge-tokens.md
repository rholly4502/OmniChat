# Cycle 52 — JobsView status-badge tokens (2026-11-06)

**Commit `c08b9ef`** (fix) + this archive doc. Frontend-only.

## Bug
`JobsView.tsx` `statusTone()` referenced `chill-indigo` (Interview) and
`chill-emerald` (Tawaran), but neither token existed in `index.css` `@theme`
(or `.night-mode`). Tailwind v4 silently drops unknown-color utilities, so both
status badges rendered with **no background/text/border color** — a silent UI
bug with no test coverage.

## Fix
Added both tokens to `@theme` and `.night-mode` (warm register, WCAG AA as text
on bg/surface):

- Day: indigo `#a6a0d9` (7.5:1 on bg, 6.9:1 on surface), emerald `#7fae8c`
  (7.2:1 / 6.6:1).
- Night: indigo `#9993cb` (6.7:1 / 6.4:1), emerald `#76a483` (6.7:1 / 6.4:1).

Added guard test in `pixel2-css-consistency.test.ts` pinning both tokens appear
exactly twice (day + night). Purely additive; no component changes.

## Verification
- tsc `--noEmit`: 0 errors; oxlint clean; `vite build` succeeds.
- vitest: **769 passed** (was 768, +1 guard).
- dotnet test: **543 passed** (backend untouched).
- Deploy: live bundle `index-uxfskR9p.js` + `index-Cxgx_AYo.css` match local
  dist byte-for-byte; live CSS contains `--color-chill-indigo:#a6a0d9`,
  `.bg-chill-indigo`, `.text-chill-emerald`, `.border-chill-indigo`.

## Lesson
A token referenced in TSX but absent from `@theme` is invisible to every test —
grep the *defined* token set (`grep -oE -- '--color-chill-[a-z-]+' index.css`)
against the *referenced* set (`grep -rhoE 'chill-[a-z-]+' components/`) to catch
orphan color references.
