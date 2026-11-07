# Cycle 60 — date-grouped sidebar history (2026-11-07)

**Commit `9c8b9ad`**, frontend 816 → **824**, backend 571/571, lint + build clean, CI + Deploy green, live bundle matched.

## What & why
The session list was one flat, unscannable list once a user had many conversations.
Added a pure, deterministic grouping helper `groupSessionsByDate`
(`frontend/src/sessionGroups.ts`) that splits server conversations into recency
buckets while preserving the **pinned-first ordering contract**:

  Disematkan → Hari Ini → Kemarin → 7 hari terakhir → Sebelumnya → Draf (last)

Empty buckets are omitted. All bucketing is driven by `updatedAt` (epoch ms),
with local-calendar-day boundaries; drafts (non-server ids) always sort last.

## Files
- `frontend/src/sessionGroups.ts` — pure helper (73 lines). Pinned server
  convos first (own bucket), unpinned by recency, drafts last. Deterministic for
  a given `now`.
- `frontend/src/__tests__/sessionGroups.test.ts` — 6 unit tests: empty list,
  pins-first regardless of age, recency buckets, today/yesterday/week boundary,
  drafts-last + no-empty-buckets, pinned/unpinned/drafts split.
- `frontend/src/components/Sidebar.tsx` — import + two anchored replacements:
  the list map now iterates `groupSessionsByDate(...)` and renders a muted
  `text-xs text-chill-muted` heading above each bucket. Session rows and every
  affordance (select/rename/pin/export/delete/token-cost/preview) untouched.
- `frontend/src/__tests__/Sidebar.test.tsx` — 2 new tests assert headings
  (Hari Ini/Sebelumnya/Draf and Disematkan) plus rows render.

## Technique
Editing a big, heavily-tested shared component safely: extract the logic into a
pure helper that is fully unit-testable, then make the JSX change as **two
anchored string replacements** (the open of the map + the close), not a rewrite.
TSC + oxlint + build + the two suites all stayed green on the first try.

## Verification
- `npx tsc -b` clean; `npm run lint` clean; `npm run build` clean.
- Frontend 824/824 (was 816), backend 571/571 (unchanged — no backend edits).
- Live bundle `assets/index-_JZ2C36a.js` == local `dist/index.html` hash exactly;
  bundle contains the `Hari Ini` heading string.
- `/health` → 200 `application/json` `{"status":"Healthy",...}`;
  `/api/models` → 401 `application/problem+json`.
