# Cycle 97 — form-field focus border transition (pixel language)

**Commit `0cfaed9`** — CI green, Deploy green, live bundle `index-DpK8laZH.js` matches local dist.

## What & why
Form inputs/selects (Sidebar search, ExpensesView filters/date inputs, HistoryFilters)
used `focus:border-chill-accent` with **no transition** — the accent snapped instantly,
breaking the pixel transition language used everywhere else (buttons/tabs/checkboxes step
in hard beats). Added a global CSS rule so text-entry fields step border/background in the
same 120ms stepped language.

## Change
- `frontend/src/index.css`: new rule —
  `input:not([type='checkbox']):not([type='radio']):not([type='range']), select, textarea`
  → `transition-property: border-color, background-color; transition-duration: 120ms`.
  Class-carried Tailwind `transition-*` utilities still win (class beats element), so
  existing controls (e.g. Composer's `transition-[border-color,box-shadow]`) are unchanged.
  Reduced-motion handled by the existing global media block (durations zeroed).
- `frontend/src/__tests__/pixel2-css-consistency.test.ts`: new guard pins that text-entry
  fields carry the border-color property + 120ms duration (catches reversion to instant snap).

## Verification
- `npx tsc --noEmit` → 0 errors; `npm run lint` → clean; `npm run build` → success.
- vitest chunked (`--pool=forks`): **All suites pass** — 16/16 (220), 16/16 (258),
  16/16 (227), 18/18 (313) = **1018 frontend tests**.
- Live: `/health` → 200 `application/json` verbose; `/api/models` → 401; live bundle hash
  matches dist exactly; live CSS `index-saRXK0fT.css` contains the new
  `transition-property:border-color,background-color;transition-duration:.12s` rule.
