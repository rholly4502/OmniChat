# Cycle 74 — remaining per-day allowance: summary vs advice panel (evaluation mode)

Commit `e86a9f7` (frontend-only), CI green, Deploy green, live bundle
`index-C9hlMO6o.js` matched local dist exactly.

## The gap (found in evaluation mode)
Two panels on the same screen computed "remaining per-day allowance" from the same
remaining budget but with different day-count semantics:

- Summary (`expenseBudget.ts`): `daysLeft = daysInMonth - today + 1` (INCLUDES today)
  → day 8 of 30 → 23 days → ±86.304/hari.
- Advice panel (backend `RemainingAllowance`): `daysLeft = effectiveDays - today`
  (EXCLUDES today) → 22 days → ±90.227/hari.

Conflicting money guidance on one screen. The backend's rule is the documented,
self-consistent one (its remaining-budget numerator already reflects today's spend, so
allocating across only the remaining days is coherent). The summary was the outlier.

## The fix
`frontend/src/expenseBudget.ts` now excludes today (`Math.max(1, daysInMonth - today)`)
to match the advice panel's convention; the doc comment notes the alignment. Both
panels now show the same per-day figure for the same month.

## Verification
- Frontend 871/871 (6 `expenseBudget.test.ts` expectations updated: day 3 → 27 days,
  280k → 10.370, 100k → 3.704, −14k → −519; last-day case unchanged at 1/7.000).
- Backend 583/583 (unchanged — no backend touched).
- lint + build clean; live bundle `index-C9hlMO6o.js` == local dist; `/health` 200
  `application/json`, `/api/models` 401 `application/problem+json`.
