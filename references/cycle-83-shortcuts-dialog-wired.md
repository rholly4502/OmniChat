# Cycle 83 — wired the orphaned keyboard-shortcut dialog into the UI (2026-11-08)

Commit `__COMMIT__`. Frontend **911/911** (62 files, +11), backend **599/599**, lint clean,
`tsc -b` + `vite build` clean. CI+Deploy verified via workflow API.

## The leftover, now wired
`ShortcutsDialog.tsx` sat untracked + unreferenced since cycle 82 (a complete, accessible
pixel keyboard-shortcut dialog). This cycle wired it in as the visible affordance for the
app's global shortcuts (`/`, Ctrl+K, Ctrl+Shift+F, Ctrl+N), which were otherwise invisible.

## Changes
- **ChatHeader.tsx** — new optional `onOpenShortcuts` prop; renders a `?` help button in the
  right action group when provided (hidden otherwise). Desktop path.
- **MobileTopBar.tsx** — same optional prop; help button added to both the **admin** chat bar
  and the **guest** bar (guests share `/`, Ctrl+K, Ctrl+Shift+F).
- **App.tsx** — `shortcutsOpen` state; wired to ChatHeader + both MobileTopBar instances;
  `<ShortcutsDialog>` rendered in both the admin and guest returns.
- **Tests** — new `ShortcutsDialog.test.tsx` (6: closed null, dialog+rows, close btn, Escape,
  backdrop, focus+scroll-lock). `ChatHeader.test.tsx` +2, `MobileTopBar.test.tsx` +3.

## Pitfalls (this cycle)
- `getByText(' (admin)')` fails because testing-library normalizes the leading space away on
  both sides; use a regex `/\\(admin\\)/` matcher instead.
- `getByText('Fokus kolom ketik')` returns **multiple** elements — two shortcut rows share the
  action; use `getAllByText(...).length >= 1`.
- `pkill -9 -f "vitest[ ]run"` self-matches the shell whose own command line contains
  `vitest run` and kills it (exit 137). Run the suite without the pkill preamble unless
  there is a known orphan.
