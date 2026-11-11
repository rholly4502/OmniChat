# Cycle 108 — Modal focus restoration (WCAG 2.4.3)

## What & why
The three full-screen modals — ChatStatsDialog, ConversationAuditDialog, ShortcutsDialog —
share the `useModalDialog` hook, which already did body scroll-lock, initial focus on the
close control, Escape-to-close, and a Tab focus trap. But it **never returned focus to the
opener** on close. A keyboard user who opened Stats then closed it was left with focus
dropped to `<body>`, breaking the ARIA dialog pattern (WCAG 2.4.3 Focus Order). The sidebar
drawer already had this via `restoreFocusRef`; the modals did not.

## Change (one commit)
- `frontend/src/hooks/useModalDialog.ts`: capture `document.activeElement` as `prevActive`
  at the top of the open-effect (before the close control steals focus), and on cleanup
  `prevActive?.isConnected` guard — focus scroll to the opener. The `isConnected` check is
  not cosmetic: the opener may have unmounted while the dialog was open (e.g. the view
  switched), and focusing a detached node is a silent no-op.
- `frontend/src/__tests__/useModalDialog.test.tsx`: new test `restores focus to the opener
  when the dialog closes` — focuses a real opener button before `open` flips, asserts focus
  lands back on it after close.

## Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **1024 passed** (was 1023; +1 focus-restoration test)
- `npm run lint` → clean, 0 warnings
- `npm run build` → success (bundle `index-C4hHcnyj.js`)

## Scope / safety
- Pure frontend hook change; no component JSX touched, so the `dialog-transition.test.ts`
  and `pixel2-*` guards (which read component source) are unaffected.
- No C# deployment guard reads `useModalDialog.ts` (verified via grep in
  `DeploymentConfigTests.cs`), so no backend run needed for this cycle.
- Reduced-motion unaffected: focus is not an animation.
