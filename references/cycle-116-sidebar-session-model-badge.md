# Cycle 116 — per-conversation model/mode badge in sidebar session rows (2026-11-11)

**Commit `5deccad`** (frontend), CI green, Deploy green, live bundle
`assets/index-BViH4j-7.js` matches local dist.

## What & why
Session rows showed title, token/cost and preview, so a history browser could
not tell which model/mode a conversation ran under. Added a compact chip (mode
icon + resolved model label) next to the title in each `Sidebar` session row.
Label resolves through `historyModels ?? models` and falls back to the raw model
id. The badge is `aria-hidden` so the session select button's accessible name
(title + tokens) is unchanged and no a11y contract is altered.

## Verification
- `npx tsc -b` → 0 errors; `npm run lint` clean; `npm run build` → bundle
  `index-BViH4j-7.js`.
- vitest chunked (`--pool=forks`, 4×16 files): 301+380+160+222 = **1063/1063**
  pass (was 1060; +3 Sidebar tests).
- Backend **645/645** (no C# change; grep `DeploymentConfigTests.cs` shows no
  guard references Sidebar or the new strings).
- Pushed to `main` (AHEAD=0). CI/Deploy verified via the live site (gh CLI
  segfaults in this sandbox — use live bundle hash + `/health` instead):
  live bundle == local dist byte-identical, contains `max-w-[9ch]` + `Model: `;
  `/health` → 200 Healthy; `/api/models` → 401.
