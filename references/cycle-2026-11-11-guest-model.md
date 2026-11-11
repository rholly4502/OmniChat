# Cycle — guest mode pinned to agent model (2026-11-11)

Commit `96a5c02`. Fix + regression test.

## Bug
A guest (no credential, forced onto the Direct bridge) still initialised
`model='hermes'` — an agent-only catalog id that is NOT in the direct catalog.
Two user-visible consequences:

1. The guest top bar hid its model selector: `modelInCatalog` (true only when the
   active model is in `catalog.direct`) failed, so the `<select>` never rendered
   and the guest had no way to choose a direct model.
2. The chat request carried `model='hermes'` over the Direct bridge — a model id
   the open provider does not know.

## Fix (`frontend/src/App.tsx`)
Effect that re-homes the guest's active model:

```tsx
useEffect(() => {
  if (!isGuest) return;
  const firstDirect = catalog.direct[0]?.id;
  if (!firstDirect) return;
  if (catalog.direct.some((m) => m.id === model)) return;
  // oxlint-disable-next-line react/set-state-in-effect
  setModel(firstDirect);
}, [isGuest, catalog.direct, model]);
```

The `catalog.direct[0]?.id` guard matters — the first element can be missing.
Manual guest selections persist: the effect only fires when the current model is
absent from the direct list.

## oxlint suppression form
oxlint ignores `// eslint-disable-next-line react(set-state-in-effect)`. The form
it honours is `// oxlint-disable-next-line react/set-state-in-effect` (slash, not
parens). Verified: `npm run lint` exits 0.

## Test (`frontend/src/__tests__/App.test.tsx`)
`guest re-homes the active model onto the direct catalog (not the agent default)`:
renders in guest mode, finds the `Ganti model` combobox, asserts its current value
is one of the rendered options and is not `hermes`. The catalogue fetch resolves
async, so assert against `select.options` (the rendered list), not the mock
payload — the first effect run may have used the default catalog.

## Verification
- Frontend 1057/1057 (was 1056 + 1 new), lint clean, build clean.
- Backend 642/642 (unchanged).
- CI success, Deploy success for `96a5c02`.
- Live bundle `assets/index-DVwcLELh.js` matches freshly-rebuilt local dist.
  (Rebuild before comparing — the first compare used a pre-edit `dist`.)
