# Cycle 126 — chevron rotation stepped-timing consistency (2026-11-12)

Commit `8fae011`. Frontend-only; backend untouched. CI + Deploy green; live
bundle hash matches local dist.

## Gap found
A cross-tab audit of the pixel2 motion language found two chevrons that rotated
with a smooth tween instead of the stepped pixel beat every other rotation uses:

- `MessageList.tsx` — the reasoning-toggle chevron (`Berpikir` disclosure)
- `ConversationAuditDialog.tsx` — the expandable-message row chevron

Both used a bare `transition-transform` (Tailwind's default smooth ease). Every
other rotating chevron in the app — Sidebar group summaries, AdvicePanel, EventsView
filter, JobsView filter — uses the stepped register `transition-transform duration-150
[transition-timing-function:steps(3,jump-none)]`. Two controls animated smoothly while
their siblings snapped in hard beats, so the interaction language felt inconsistent.
The tween is a valid class, so it rendered fine and slipped past every rendered test.

## Fix
Normalised both chevrons to the app's standard stepped register:
`transition-transform duration-150 [transition-timing-function:steps(3,jump-none)]`.
Only existing utility vocabulary; no new tokens/colors/animation.

## Regression guard
New test in `pixel2-press-consistency.test.ts` ("every rotated chevron uses the
stepped pixel timing (no smooth tween)") scans every shipped source file and bans any
`rotate-180` that is not paired with a `steps(...)` timing function on the same line.
This pins the motion register so a tweened chevron cannot recur.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 1103 passed, 66 files (was 1102)
- `npm run lint` (oxlint) → clean
- `npm run build` → success (chunk-size warning pre-existing/benign)
- `dotnet test tests/OmniChat.Tests` → 657 passed, 0 failed
- CI + Deploy rows green; live bundle hash matches local dist; `/health` → Healthy.
