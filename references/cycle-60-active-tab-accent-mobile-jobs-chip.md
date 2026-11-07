# Cycle 60 — active-tab accent + mobile jobs-view chip (2026-11-07)

Commit: (see header). Frontend-only UI polish; backend untouched.

## Changes
1. **Sidebar view-switcher active tab** now wears the theme's `border-l-2` accent
   left-bar (`border-chill-accent`) on the selected tab. Inactive tabs keep an
   invisible `border-l-2 border-transparent` so the 2px bar never shifts the
   label when selection changes. Strengthens selected-vs-unselected contrast
   (the "active vs nonaktif" goal) using an existing theme signature — no new
   color/corner token.
2. **MobileTopBar** previously leaked chat telemetry (Agent/Direct badge, model
   switcher, token/cost readout) on the Job Opportunity view, because the
   telemetry branch only excluded `'expenses'`. It now shows a `Lowongan` pixel
   chip (mirroring the existing `Pengeluaran` chip) on the jobs view and keeps
   telemetry for chat only.

## Tests
- MobileTopBar.test.tsx: +1 (`on the Lowongan view shows a pixel view chip and
  hides chat telemetry`).
- Sidebar.test.tsx: extended the view-switcher test to assert the active tab's
  `border-l-2` + `border-chill-accent` and the inactive tab's `border-transparent`.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 803/803 (was 802; +1).
- `npm run lint` → clean; `npm run build` → success (bundle `index-BwN1-fEx.js`).
- `dotnet test tests/OmniChat.Tests -c Release` → 568/568.
- pixel2 guards still enforce every button `rounded-none`; expenses/advice 44px
  floor unchanged (no expenses/advice edits).
