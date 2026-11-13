# Cycle 101 — dropdown menu-item pressed state (2026-11-13)

**Commits:** `c5a9f8b` (style) + `c5a9f8b` test sibling — frontend only, no backend change.
CI + Deploy green for `c5a9f8b`; live bundle `assets/index-Cv8eRgwF.js` matches local dist.

## What & why
Dropdown menu items (export menus in ChatHeader, MobileTopBar, and the two Sidebar
session-row menus) used the same background for hover and active
(`hover:bg-chill-surface active:bg-chill-surface`), and have no translate-slide
feedback, so a click gave no visible pressed step — violating the "state aktif vs
nonaktif kontras" goal.

Fix: press now darkens one register further to `active:bg-chill-bg` (darkest
token) so click feedback reads as a real step. Menu container stays `elevated`,
hover `surface`, press `bg` — a proper three-step stair.

## Verification
- `npx tsc --noEmit` → 0 errors; `npm run build` success; `npm run lint` clean.
- Popover-guard test extended with `menu items have a distinct pressed state`
  (asserts `active:bg-chill-bg` count per menu: header 1, mobile 1, sidebar 2).
- Targeted run: popover-transition + Sidebar/ChatHeader/MobileTopBar = 173 pass;
  pixel2 consistency/press/stepped guards 37 pass. Baseline full suite 1123/1123.
- Live bundle hash == local dist (strongest deploy check); `/health` etc. unchanged.

## Pitfall
`gh run list` segfaults in this sandbox (SIGSEGV repeatedly). Use
`curl https://api.github.com/repos/rholly4502/OmniChat/actions/runs?per_page=N`
with jq/python instead to inspect CI/Deploy status.
