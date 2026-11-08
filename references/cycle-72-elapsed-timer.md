# Cycle 72 — live elapsed-time readout on the streaming indicator (2026-11-08)

Commit `3626e72`. Backend **583/583**, frontend **866/866**, lint + build clean,
CI green, Deploy green, live bundle `index-XN320ziM.js` byte-identical to local dist.

## What shipped
`TypingIndicator` now runs a one-second timer from the moment a reply begins
streaming (the indicator mounts exactly when a fresh reply starts) and shows how
long the current generation has been running, rounded up, only after 1s. The
readout renders **outside** the `role="status"` live region and is `aria-hidden`,
so a screen reader is not spammed with a new announcement every second.

## The flaky-test find (root-cause fix)
`Sidebar.test.tsx` (date-grouping) hard-coded its reference now as
`new Date('2026-11-07T12:00:00Z')` but never injected it — `groupSessionsByDate`
falls back to the real `Date.now()`. The test passed only while the real date was
that day, then broke on the rollover (a session 1s old became "Kemarin", not
"Hari Ini"). Fix: `const NOW = Date.now();` so the assertions stay valid any day.
`sessionGroups.test.ts` injects `now` directly and was already deterministic.

**Lesson: a test that pins an absolute date but relies on the real clock is a
ticking time bomb. Derive the reference from `Date.now()` (or inject the clock),
never hard-code a calendar literal, or it breaks on the next day rollover.**

## Verification
- Live `index.html` asset == local `dist/index.html` asset (`index-XN320ziM.js`).
- Live JS sha256 == local dist JS sha256 (`a17aba068d…`).
- `/health` → 200 `application/json` Healthy; `/api/models` → 401 `application/problem+json`.
