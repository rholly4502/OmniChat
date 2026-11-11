# Cycle 110 — skip-to-content link (WCAG 2.4.1) (2026-11-11)

**Commit `a4f7caa`**, CI + Deploy hijau, bundle hash match live.

## Gap
The app had no skip-to-content link. The sidebar (with full navigation + history
filters) renders before the main region on desktop, so a keyboard user had to tab
through the entire sidebar/header before reaching content — aWCAG 2.4.1
(Bypass Blocks) failure. The only `aria-live` and focus-trap work was already in
place; this was the missing "bypass blocks" piece.

## Fix (purely frontend, surgical)
1. `frontend/src/App.tsx` — added a skip link as the first focusable element in the
   root `<div>`: `href="#main-content"`, text "Lompat ke konten". It is `sr-only`
   until focused (`focus:not-sr-only`), then appears as a pixel2-styled chip
   (square `rounded-none`, chill tokens only: `border-chill-accent`,
   `bg-chill-elevated`, `text-chill-accent`, `ring-chill-accent/60`). No new
   colours, no rounded corners — matches the theme.
2. Gave the `<main>` region `id="main-content"` so the link has a target.

Behaviour preserved: `aria-hidden={sidebarOpen}` on `<main>` is untouched; on mobile
the drawer focus trap still governs when open, and at initial load the drawer is
closed so the skip target is not aria-hidden.

## Test
`App.test.tsx` — new describe "App skip-to-content link": link exists with
`href="#main-content"`, the `#main-content` element exists, link is `sr-only`
idle and gains `focus:not-sr-only` + focus on `focus()`, and the focused classes
stay pixel2 (rounded-none / chill tokens).

## Verification
- `npx tsc --noEmit` → 0 errors
- `npm run lint` → bersih
- `npm run build` → sukses (chunk-size warning is pre-existing, from jspdf/html2canvas PDF export)
- `npx vitest run` → **1033 passed** (1032 → +1)
- `dotnet test tests/OmniChat.Tests -c Release` → **624/624 passed** (no backend
  change; deployment guards that read App.tsx assert only on strings that are
  untouched — `describeApiError`, `useServerHistory`, `onConversationId`)
- Verify CI + Deploy rows green after push, and live bundle hash == local
  `frontend/dist/index.html`.

## Lesson
When adding a first-focusable element, confirm no existing test asserts the prior
first focusable element or a specific tab order. Here the suite only asserted on
`.flex.h-dvh` root classes and sidebar focus open/close, so inserting a new first
child was safe. Run the full vitest suite, not just the touched file, because
App.test.tsx's 56 tests all render `<App />` and any structural change to the root
render would surface there.
