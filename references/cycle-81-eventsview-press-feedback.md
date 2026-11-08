# Cycle 81 — EventsView press-feedback parity with JobsView

Surgical micro-interaction pass: the Event & Promo tab's filter tabs and the
"Lihat promo" link were the remaining interactive surfaces missing the app-wide
press-slide (`active:translate-y-[2px]`) feedback that the sibling Job
Opportunities tab (and every other control) already had. Brought them to parity.

- `EventsView.tsx` — filter tab buttons (Semua + per-app): added
  `active:translate-y-[2px]` to both the active and inactive states, matching
  the JobsView filter tabs. Inactive tabs keep `hover:bg-chill-elevated`.
- `EventsView.tsx` — "Lihat promo →" external link now adds
  `active:bg-chill-accent/30 active:translate-y-[2px]`, matching the JobsView
  "Lihat lowongan" link.
- `EventsView.tsx` — event cards now carry `transition hover:bg-chill-elevated`
  like the job cards, so list rows give hover feedback on desktop.
- `EventsView.test.tsx` (new) — 4 tests: grouped headings + counts, filter tabs
  carry `rounded-none` + `active:translate-y-[2px]`, promo link carries press
  bg/translate + 44px target, event cards carry hover surface + `rounded-none`.

No backend/data touched. All chill tokens, 44px targets and focus-visible rings
unchanged.

## Gates (all green)
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → full suite green (EventsView 4/4)
- `npm run build` → success (pre-existing vendor chunk-size warning only)
- `dotnet test tests/OmniChat.Tests -c Release` → green
