# Cycle 100 — pressed-state fill on Job/Event filter tabs (2026-11-13)

## Commit `afab411` — style(ui): give inactive Job/Event filter tabs a pressed fill

Inactive filter-tab buttons in `JobsView` and `EventsView` (type / status / tier /
app filters) only had `active:translate-y-[2px]` on press — a displacement with no
fill change, so the pressed state read as dead next to the rest of the pixel
register (which uses `active:bg-*` everywhere). Added `active:bg-chill-elevated`
to the inactive branch of all six tabs (4 in JobsView, 2 in EventsView), matching
the Sidebar view-switcher's pressed-fill behavior. Token-only, square, no new
color/radius; `prefers-reduced-motion` unaffected (no motion added).

## Verification (all on the new code)
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 68 files / **1123/1123** passed
- `npm run build` → success (pre-existing jspdf chunk-size warning only)
- `dotnet test tests/OmniChat.Tests` → **665/665** passed

## Audit posture
One systematic pass over every tab + shared component (Chat, Pengeluaran,
Jobs, Events, sidebar, header, dialogs, loaders, login) found the pixel2/chill
design floor uniformly upheld — no raw hex, all rounded-none, ≥44px + focus rings
+ press states, aria labels, role=status loaders, global reduced-motion. Only the
filter-tab pressed fill above was a real gap; no speculative churn beyond it.
