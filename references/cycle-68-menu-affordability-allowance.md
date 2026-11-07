# Cycle 68 — daily frugal menu vs remaining per-day allowance (evaluation mode)

Commit `ca7ea1e`, CI green, Deploy green, live bundle `index-D59-BLNG.js` matched local dist exactly.

## The gap (found in evaluation mode)
P1-6's daily menu plan was checked against the day's *actual* food spend (cycle 48) but never
against the budget the user actually has left per day. When `remainingAllowance.perDayAllowance`
is smaller than the selected menu's min cost, the recommended menu is unaffordable — the panel
silently recommended it anyway.

## The fix (frontend-only, no backend change)
`AdvicePanel.tsx` now compares `daily.biayaMin/biayaMax` with `remainingAllowance.perDayAllowance`:
- `biayaMin > perDayAllowance` → red callout: menu exceeds remaining per-day allowance for the days left.
- `biayaMax <= perDayAllowance` → sage confirmation: menu fits within remaining allowance.
- no allowance (0) → nothing (matches the food-spend guard's silence).

Wording note: the two callouts say `per hari`, never `/hari` — the pre-existing
remaining-allowance test matcher is `.../hari`, so `/hari` in the new text would collide and break it.

## Verification
- Frontend 848 → 851 (3 new tests: red when over, sage when within, silent when zero allowance).
- Backend 578/578 (unchanged — no backend touched).
- lint + build clean; live bundle `index-D59-BLNG.js` == local dist; both new markers present live (×1 each).
