# Cycle 136 — button type consistency (2026-11-14)

**Commit:** `008d382` — `type="button"` on the three interactive buttons that
lacked it + a new source-level guard test.

## What & why

Every `<button>` wired to an `onClick` handler now declares an explicit `type`
(`"button"` / `"submit"`). A `<button>` with no `type` defaults to
`type="submit"`, so one accidentally nested inside a `<form>` would submit the
form (navigation / data loss) instead of running its click handler. React's
jsdom renders buttons with no form-submit semantics, so a rendered assertion can
never catch this — it has to read source.

**Fixed (all had `onClick`, none were submit buttons):**
- `components/Sidebar.tsx` — mobile drawer close button (`closeButtonRef`).
- `components/MobileTopBar.tsx` — logout button (`onLogout`).
- `components/MobileTopBar.tsx` — hamburger / open-drawer button (`onOpenSidebar`).

The one intentional submit button (rename-session ✓ in `Sidebar.tsx`) carries
`type="submit"` and is left untouched.

## New guard

`src/__tests__/pixel2-button-type-consistency.test.ts` — source scan (same
`buttonTags()` scanner as `pixel2-press-consistency`): every `onClick` button
must match `/type\s*=\s*["'`](button|submit)["'`]/`.

## Verification

- `tsc --noEmit` — 0 errors.
- Frontend **1126 tests** across 69 files — all green (was 1125/68; +1 guard).
- `npm run lint` — clean; `npm run build` — success.
- Backend `dotnet test` — **666/666** pass (no backend changes; run to confirm
  the UI-only change didn't disturb anything).
- Live bundle hash must match `frontend/dist/index.html` after deploy.

## Lesson

`type="button"` is a one-token hardening but it is the difference between a
click handler running and a surprise page navigation if a button is ever moved
inside a form. Guard it at source level because jsdom cannot represent the
default-submit behavior.
