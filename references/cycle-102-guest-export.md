# Cycle 102 — guest conversation export menu (2026-11-10)

## What & why
Desktop admin (`ChatHeader`) had a full export menu (Markdown/JSON/CSV/PDF), but
guests could only copy-as-markdown. Guest conversations are ephemeral (no stored
history, no sidebar), so a file-download path is their only way to preserve a
conversation. This adds the same four-format export menu to the guest mobile top bar.

## Change
- `MobileTopBar.tsx`: optional `onExport?` prop. Guest branch renders an export
  button (44×44, pixel register) with a four-item menu (`EXPORT_FORMAT_LABELS`),
  outside-click/Escape close (parity with ChatHeader), `role="menu"`/`menuitem`.
  Hidden when unwired.
- `App.tsx`: `exportGuestConversation(format)` builds the in-memory `messages`
  into Markdown/JSON/CSV/PDF via `buildConversation*` + `downloadBlob`, tagged with
  the direct model + usage meta. Wired into the guest `MobileTopBar`.

## Verification
- `tsc --noEmit` clean; oxlint clean; `vite build` succeeds.
- vitest: full suite green — 63 files, **987** tests (was 983; +4 new
  MobileTopBar cases: renders menu, invokes format + closes, omitted without
  handler, never in admin).
- Backend: no source touched; deployment guards (`describeApiError`,
  `useServerHistory` in App.tsx) still hold — `dotnet test` 619/619 green.
