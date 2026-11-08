# Cycle 80 — unify press-slide click feedback (sidebar tabs + header toolbar)

Surgical micro-interaction pass: the sidebar view-switcher tabs and the desktop
ChatHeader icon-toolbar were the two interactive surfaces still missing the
app-wide press-slide (`active:translate-y-[Npx]`) feedback that every other
control (Composer send/stop, New Chat, MessageList ActionButton, filter tabs)
already had.

- `Sidebar.tsx` — view tabs (Chat/Pengeluaran/Lowongan/Event): inactive tabs now
  `active:translate-y-[2px]`; the selected tab now gets `active:translate-y-[3px]`
  + `active:shadow-none` (it carries `pixel-shadow-sm`, so the press now sinks
  into its own hard shadow like the New Chat button). Active/inactive state
  contrast is unchanged; the 2px accent left-bar and `pixel-shadow-sm` are kept.
- `ChatHeader.tsx` — copy/export/audit/stats icon buttons: added
  `active:translate-y-[2px]` alongside the existing `active:bg-chill-elevated`
  so toolbar clicks feel physical on desktop too.
- `Sidebar.test.tsx` — extended the existing "hard-edged hover/press surface"
  test to pin the new press-slide tokens on both active and inactive tabs.

No backend/data touched. All chill tokens, `rounded-none`, 44px targets and
focus-visible rings unchanged.

## Gates (all green)
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 884 passed (60 files)
- `npm run lint` (oxlint) → clean
- `npm run build` → success (pre-existing vendor chunk-size warning only)
- `dotnet build OmniChat.slnx -c Release` → 0 warnings/0 errors
- `dotnet test OmniChat.slnx -c Release --no-build` → 592 passed
