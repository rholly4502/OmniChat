# Cycle 115 — Sidebar disclosure-togg press feedback (2026-11-11)

**Commit `82ab9b4`** (frontend), CI green, Deploy green, live bundle
`assets/index-C4XgxErZ.js` matches local dist.

## What & why
A source-wide sweep of the pixel2 micro-interaction register found the only
interactive controls in the app without a press affordance: the two Sidebar
`<summary>` disclosure toggles (Penggunaan, and the advanced panel). Every button,
select, and checkbox presses with `active:translate-y-[2px]`; the summaries had
hover text + stepped chevron + focus ring + 44px hit area, but sat static on
click. Added `active:translate-y-[2px]` so they feel pressable like everything else.

- `Sidebar.tsx`: both `<summary>` toggles gain `active:translate-y-[2px]`.
- `pixel2-consistency.test.ts`: new guard `every <summary> toggle presses
  (active:translate-y) like the buttons` — scans all shipped source for `<summary>`
  opening tags (brace/quote-aware, same trick as the button scanner) and asserts
  each carries the press class, so this class of gap cannot regress.

## Verification
- `npx tsc --noEmit` → 0 errors.
- vitest chunked (`--pool=forks`, 4×16 files): 297+377+160+222 = **1056/1056**
  pass (64 files), incl. the new guard.
- `npm run lint` clean; `npm run build` success (bundle `index-C4XgxErZ.js`).
- Backend **642/642** (no C# change; no deployment guard references the edited
  strings — checked `DeploymentConfigTests.cs` for `active:translate-y`/`<summary>`).
- CI `success`, Deploy `success`; live `/health` healthy, `/api/models` → 401;
  live bundle hash matches dist, and the served JS contains `active:translate-y-[2px]`
  (93 occurrences, source-wide count). AHEAD=0 after push.
