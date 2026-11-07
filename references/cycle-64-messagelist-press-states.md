# Cycle 64 — MessageList press-state gaps closed (2026-11-07)

Commit `polish(ui): pressed-state feedback on MessageList cancel/search/jump buttons`.
Frontend-only; backend untouched.

## What

A full sweep of every `<button>` in `src/` found **exactly three** interactive
buttons still missing a pressed state (hover only, no `active:` feedback) — the
same gap cycle 62 closed for dialog icons. All three live in `MessageList.tsx`
(the core chat transcript, shared across chat/agent/direct):

1. **`Batal` (cancel-edit)** — secondary bordered button. Added
   `active:bg-chill-elevated active:translate-y-[2px]`.
2. **`Lompat ke bawah`** (jump-to-bottom floating button, accent-on-hover).
   Added `active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none`
   (mirrors the Composer/Sidebar primary-button press idiom).
3. **`Cari di percakapan`** (search toggle floating button). Added
   `active:bg-chill-elevated` (mirrors the ChatHeader icon-button press idiom).

No new color/corner token; all use existing chill tokens. `prefers-reduced-motion`
handled by the global reduced-motion block (transition/settle instantly). All three
buttons already meet the 44px touch floor.

## Tests
- `MessageList.test.tsx`: +3 (`cancel-edit carries pressed state`, `jump-to-bottom
  carries pressed state`, `search toggle carries pressed state`) — assert the
  `active:` classes + `transition` via `toHaveClass`.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 840/840 (58 files; was 837).
- `npm run lint` → clean; `npm run build` → success (chunk-size warning pre-existing).
- `dotnet test tests/OmniChat.Tests -c Release` → 576/576.
- pixel2 guards (incl. `pixel2-css-consistency`) stay green (part of vitest run).

## Recurring pitfall
The regex `<button([^>]*)>` with `re.S` catches className attributes even when the
tag spans lines — the three misses were genuine hover-without-active, not a parsing
artifact. Run the same sweep after any future button additions.
