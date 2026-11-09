# Cycle 91 — complete the pixel press-slide across every control

Every interactive control in the app carries the pixel2 press-slide
(`active:translate-y-[2px]` / `[3px]`) except three, which only swapped text
colour on press (no physical feedback). This cycle closes that gap so the
"feedback klik" language is uniform on every button.

- `Sidebar.tsx` — the **Clear chat** button (destructive, full-width) now
  presses down like every other control instead of only turning red.
- `MobileTopBar.tsx` — the two **Guest-mode** icon buttons (shortcuts, logout)
  now press down too; they were the only controls in the guest workspace with
  zero press signal.

Scope: purely presentational class strings. No logic, no icons, no markup
changes, no backend. Backend 615/615 (unchanged); frontend 947/947; tsc, oxlint
(one pre-existing `Date` purity warning in JobsView, untouched), and `vite
build` all clean.

## Why only these three
A source scan for `<button>` without `active:translate-y` surfaced 15 controls.
The other 12 are deliberate exceptions with equivalent feedback:
- sidebar session rows and menu items use a background hover/press
  (`active:bg-chill-elevated` / `hover:bg-chill-surface`);
- HistoryFilters link uses underline + colour;
- several toolbar icon buttons already use `active:bg-chill-elevated`;

Only the three edited controls had *no* press signal at all, so they were the
genuine inconsistencies against the pixel motion language.

## No new guard
A global "every button must have active:translate-y" guard would false-positive
on the 12 legitimate exceptions above (rows, links, bg-change icons), so it was
deliberately not added. The scoped press check in `pixel2-consistency.test.ts`
(expenses/advice) still covers the strictest floor.
