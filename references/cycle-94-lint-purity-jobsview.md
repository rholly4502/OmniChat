# Cycle 94 — freeze `todayISO` (oxlint react(purity)) (2026-11-09)

**Frontend-only fix.** `npm run lint` on the current HEAD flagged one warning:

```
src/components/JobsView.tsx:102:17: warning react(purity):
Cannot call impure function during render help: `Date` is an impure function.
```

`const today = new Date();` ran in the component body every render. Besides the
lint warning, it had a real (if rare) UX correctness dimension: `todayISO` — used
for the `needsFollowUp` overdue check and the follow-up date input's `min` — is
recomputed each render, so it drifts if the tab stays open across midnight.

## Fix
Capture `todayISO` once per mount with a lazy `useState(() => ...)` initializer.
Removes the render-time `new Date()` (clears the purity warning) and freezes the
deadline for the component's lifetime, so the follow-up logic is deterministic
within a session. No visual, token, focus, size, or aria change. `useState` was
already imported.

## Verification
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: clean (warning gone).
- `npx vitest run --pool=forks`: **957/957 passed (63 files)**.
- `npm run build`: succeeds (pre-existing chunk-size warning only).
- `dotnet test tests/OmniChat.Tests -c Release --no-restore`: **618/618** passed
  (frontend-only change; no deployment guard references JobsView).
- No source-text guard in `DeploymentConfigTests.cs` touches JobsView/`todayISO`, so
  the backend suite is unaffected.
