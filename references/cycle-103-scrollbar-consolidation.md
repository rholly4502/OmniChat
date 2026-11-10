# Cycle 103 — duplicate pixel2 scrollbar CSS consolidated (2026-11-10)

## Commit — style(ui): consolidate duplicate pixel2 scrollbar CSS into one coherent definition

`index.css` carried **two** full scrollbar definitions. The first (12px,
chill-elevated thumb, bordered track) predated the pixel2 pass; the second
(10px, chill-border thumb on the deep background track) is the documented
"warm border register" design. The second loaded later, so it partially
overrode the first while the first's thumb `box-shadow` and corner rule
persisted — a contradictory, dead-code pair in an explicitly-scoped area
(scrollbar consistency).

Consolidated to the single documented definition, preserving the exact
rendered output: 10px square thumb in `chill-border` on the `chill-bg`
track, with the pixel hard-offset `box-shadow` and the corner rule merged in
(these were the only parts the first block was still contributing). No color
or corner token changed; no motion added; reduced-motion unaffected (chrome
only). The `pixel2-css-consistency.test.ts` CSS guards still pass.

## Also preserved (not mine)
Working tree held uncommitted backend WIP at run start (Projection record +
service gaining `FixedCommitted`/`Discretionary`) — verified coherent and
green (619/619), committed separately as `9551fce` to avoid losing it
(established convention, cf. Cycle 100).

## Verification
- `tsc --noEmit` clean; oxlint clean; `vite build` succeeds.
- Frontend full suite green: 63 files, **987** tests (incl. all pixel2
  consistency/a11y guards).
- Backend `dotnet test OmniChat.slnx -c Release`: **619/619** green.
