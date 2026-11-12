# Cycle 127 — HistoryFilters date-input hover affordance (2026-11-12)

Small frontend-only micro-interaction fix. Commit `7c467f5`.

## What changed

The two date-range inputs (`Dari` / `Sampai`) in `HistoryFilters.tsx` were the only
bordered standalone controls that lacked a hover affordance — the bordered selects in the
same panel (and across the app, since cycle 120) all carry
`hover:border-chill-accent/60`. A user hovering the date fields got no cue they were
interactive. Added the same register-consistent hover border to both date inputs only
(the selects, model/mode, already had it). No logic, no layout, no new tokens.

## Why it matters

- Pixel2 register: hover affordance on bordered controls is the established convention;
  the date inputs were the missing corner.
- Micro-interaction: clear hover feedback without new colors or soft effects (chill-accent
  border token only).
- No CSS/animation change, so `prefers-reduced-motion` is unaffected.

## Verification (all green)

- `cd frontend && npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 66 files / **1103 passed** (incl. HistoryFilters 7/7).
- `npm run lint` → clean. `npm run build` → succeeds (no new warnings beyond the
  pre-existing >500kB chunk note).
- `dotnet test tests/OmniChat.Tests -c Release` → **657 passed / 0 failed** (backend
  unchanged; no deployment guard reads HistoryFilters).

## Pitfall

The two date `<input>` class strings are byte-identical, so a naive `.replace` must assert
exactly 2 matches before writing (did: `assert n == 2`) so the fix can't silently apply to
one field only.
