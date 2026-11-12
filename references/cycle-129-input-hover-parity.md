# Cycle 129 — bordered text-input hover-border parity (pixel2)

Small frontend-only micro-interaction fix. The pixel2 register gives every bordered
standalone control a hover affordance with `hover:border-chill-accent/60` — selects
since cycle 120, date inputs since cycle 127. The bordered **text** inputs/textarea
across the app were the remaining corner: hovering them gave no interactive cue.

## What changed

Added `hover:border-chill-accent/60` to 18 bordered text-entry fields (6 files),
matching the exact token used by selects/date-inputs. Purely additive classes, chill
token only, no new colors/corners/animation, reduced-motion-neutral (color transition
only, already handled by the global media block).

- `Composer.tsx` — chat draft textarea.
- `Sidebar.tsx` — conversation search, session rename, API key, system-prompt textarea.
- `ExpensesView.tsx` — month picker, budget/Nabung target inputs, transaction search,
  and the ExpenseForm date / nominal / time / keterangan fields (8 total).
- `JobsView.tsx` — cover-letter draft textarea, follow-up date input.
- `ChatStatsDialog.tsx` — stats date-range (Dari / sampaiai) inputs.
- `LoginScreen.tsx` — API-key field.

Borderless inline editors (MessageList search / inline-edit textarea, `bg-transparent`,
no border) are intentionally untouched.

## Guard added

`frontend/src/__tests__/pixel2-input-hover-consistency.test.ts` — source-level guard
(same scanner as pixel2-press-consistency) asserting every bordered standalone text
input/textarea carries `hover:border-chill-accent/60`, so a new field cannot be added
without the affordance. Matches 20 fields, 0 offenders.

## Verification (all green)

- `npx tsc --noEmit` → 0 errors; `npm run lint` → clean.
- `npx vitest run` → 67 files / **1113 passed** (was 1112 + 1 new guard).
- `npm run build` → succeeds (only the pre-existing >500kB chunk note).
- `dotnet test tests/OmniChat.Tests -c Release` → **662 passed / 0 failed** (no
  backend/UI-data change; deployment guards unaffected).
- Push → CI + Deploy green; live bundle hash matches local `dist`.
