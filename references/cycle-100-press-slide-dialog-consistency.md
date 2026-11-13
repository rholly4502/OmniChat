# Cycle 100 — dialog/popover press-slide consistency (2026-11-13)

**Fix:** four icon buttons in the dialogs/popover had `active:bg-chill-elevated`
but were missing the `active:translate-y-[2px]` press-slide that every other
button in the app carries (the pixel2 chunky press register).

- `ChatStatsDialog.tsx` — "Ekspor statistik sebagai CSV" button (the dialog's own
  close button already had it).
- `ConversationAuditDialog.tsx` — "Ekspor audit sebagai JSON" and
  "... sebagai CSV" buttons.
- `CostDetailsPopover.tsx` — the cost-details trigger button.

**Why it's a real gap:** the pixel2 press-consistency guard only asserts that a
clickable button has *some* `active:` state, so these passed. But beside their
sibling close buttons (which slide on press) the mismatch was visible: the export
buttons only tinted, they did not press-slide. Syntax fix only — no data/behavior
change.

**Verification:** `tsc --noEmit` 0 errors · vitest full suite 1122 passed ·
`npm run build` success · backend 664/664.
