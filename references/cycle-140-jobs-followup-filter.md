# Cycle 140 — Jobs: filter "Perlu follow-up" (frontend)

The Jobs view tracked follow-up dates (badge + inline edit) but had no way to
narrow the list to overdue items — you had to scan every card. The dashboard
already counted overdue follow-ups, so this surfaces the queue in the view.

- Frontend: `JobsView` gains a `followUpOnly` toggle that keeps only
  opportunities whose `needsFollowUp` rule matches (status applied/interview/
  offer AND `followUpTanggal <= today`), reusing the exact same logic as the
  per-card badge. Shows a live count on the button and combines with the
  status/type/tier/keyword filters; the empty-state message names the follow-up
  filter when it's active and nothing matches.
- Tests: +4 component (JobsView) — count label, filter to overdue only, toggle
  off restores, empty-state message. Full suite green: frontend (73 files),
  tsc -b, oxlint, a11y typography scan.
- Commit SHA: 1aed28c.
