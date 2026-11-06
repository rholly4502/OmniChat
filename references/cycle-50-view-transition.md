## Cycle 50 — cross-tab enter transition (2026-11-06)

Commit `5b928e8`. Frontend 757 → **760**, backend 543/543, lint/build clean, CI+Deploy green, live bundle `index-C-ZOychm.js` matches local dist.

### What changed
Tab/view switches (Chat ↔ Pengeluaran ↔ Lowongan) previously swapped instantly with no enter animation. The task explicitly asked for "animasi masuk/keluar halus" across tabs. Since each top-level view mounts fresh on switch (App renders one branch at a time), adding `pixel-reveal` to each view root replays the stepped opacity/translateY reveal on every switch:
- `App.tsx`: Chat branch (`<>` fragment) → `<div key={activeView} className="flex-1 flex flex-col min-h-0 pixel-reveal">`. The `key` forces the wrapper to remount on switch so the animation replays; `flex-1 flex flex-col min-h-0` preserves the flex column so MessageList still scrolls.
- `ExpensesView.tsx` root: `pixel-grid-page` → `pixel-grid-page pixel-reveal`.
- `JobsView.tsx` root: `h-full flex flex-col min-h-0` → `+ pixel-reveal`.
- Reduced-motion: covered by the global `@media (prefers-reduced-motion: reduce)` block in index.css (animation-duration ~0 → lands on visible state instantly). No JS involved.

### Verification
- New source-scan test `src/__tests__/view-transition.test.ts` (3 tests) pins the three contracts (chat wrapper keyed + reveal, Expenses root reveal, Jobs root reveal). Followed the existing a11y-typography / pixel2-consistency pattern (jsdom can't resolve CSS animations, so guards read source).
- `npx tsc --noEmit` → 0 errors; `npx vitest run` → 55 files / 760 passed; `npm run lint` clean; `npm run build` OK.
- `dotnet build` 0 errors; `dotnet test tests/OmniChat.Tests` → 543/543.
- Live bundle hash matches local `dist/index.html` exactly; live JS contains the new markers.

### Pitfall
- The sandbox `write_file`/`patch` tools are restricted to `/opt/data` (`/workspace`). Writing to `/root/OmniChat` must go through `terminal` heredoc/python. A `write_file` call to the repo tree landed in `/workspace/OmniChat` (a separate copy) instead — always write to the repo via terminal, not the file tools.
