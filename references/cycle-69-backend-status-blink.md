# Cycle 69 — backend-status "checking" dot blinks (pixel2 micro-interaction)

## Gap
`BackendStatus` (sidebar footer) showed a frozen, static dot in the `checking`
state while every other "working"/loading indicator in the app animates — the
chat typing indicator and `ScanLoader` both run the stepped `pixel-scan`
beat. The reachability check is exactly the state that needs the "alive"
signal, and it was the one status read with no motion. Terminal states
(online/offline) correctly stay static.

## Change (frontend-only)
`frontend/src/components/BackendStatus.tsx`: the `checking` dot now carries the
existing `pixel-blink` utility class (`bg-chill-muted pixel-blink`). No new
colors, no new keyframes — reuses the established blink register. Reduced-motion
is handled by the global `prefers-reduced-motion` media block (duration ~0,
1 iteration → dot settles static), so the blink respects user motion
preferences with zero extra code.

## Tests
`BackendStatus.test.tsx` 3 → 5:
- checking state dot has `.pixel-blink`;
- online and offline dots do NOT have `.pixel-blink` (terminal = static).

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npm run lint` → clean.
- `npx vitest run` → 58 files, **853/853** pass.
- `npm run build` → success (`index-gHUygxDd.js`). Chunk-size warning pre-existing.
- No C# deployment guard references `BackendStatus.tsx`; backend tests not applicable (no data/logic touched).
