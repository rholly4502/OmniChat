# Cycle 134 — input-transition false positive: class utilities override the global stepped register

**No production code shipped (revert `58ef0d4` after `76e60e8`).** This cycle is a lesson,
not a feature.

## Why the cycle exists
Frontend-only UI/UX pass (pixel2 chill-vibe + micro-interactions + WCAG AA). The base is
already covered by ~133 archived cycles of guards, so the goal was to find any *real* gap.

A grep for "bordered controls with `hover:border-chill-accent/60` but no `transition` utility"
returned 18 fields (Sidebar, ExpensesView, HistoryFilters, ChatStatsDialog, JobsView). That
looked like a genuine inconsistency against the "warna/border singkat" goal, so a commit added
`transition-colors` to all 18.

## The mistake
`index.css` already ships **two element-level rules**:

```css
input:not([type='checkbox']):not([type='radio']):not([type='range']),
select, textarea {
  transition-property: border-color, background-color;
  transition-duration: 120ms;
}
/* and */
button, a, select, input, summary, [role='button'] {
  transition-timing-function: steps(2, jump-none);
}
```

So every text field already steps its border accent in the pixel register (120ms, hard
beats). Adding Tailwind `transition-colors` **class** utilities overrides those element rules
(class beats element specificity — the CSS comment warns exactly about this), flipping the 18
fields from the stepped 120ms register to Tailwind's default smooth 150ms cubic-bezier tween.
That is a regression against pixel2, not a fix. Note cycle 129 *deliberately* gave these same
18 fields the `hover:border-chill-accent/60` affordance — the border *color change* comes from
the class, the *stepped transition* comes from the global rule. They are complementary; they
must not be collapsed into a single smooth utility.

## Lesson
- **Grep-discovered "missing transitions" on inputs/selects/textareas are usually the global
  register, not a gap.** Before adding a `transition-*` class, check `index.css` for
  element-level rules (`input/select/textarea` and `button/a/select/input/summary`) that
  already provide the stepped timing. A class-based addition will *override* them with smooth
  easing.
- Anything that *should* be smooth/stepped differently already opts out explicitly at the
  component (e.g. Composer's `transition-[border-color,box-shadow]`).
- When in doubt, the safe non-change is better than a "consistency" fix that quietly breaks the
  stepping register. The revert restored byte-identical production (`index-CJKIUSvv.js`).

## Verification of the revert
- Commits: `76e60e8` (bad) → `58ef0d4` (revert). Both CI+Deploy green.
- Live bundle matches clean-HEAD `dist` hash exactly (`index-CJKIUSvv.js`).
- Live bundle's `transition-colors` count returned to the original level (the 18 fields are
  not on it).
- `npx tsc --noEmit` 0 errors; `npm run lint` clean; full frontend vitest suite green
  (68 files via `--pool=forks` chunks); backend `dotnet test` 666/666.

## Notes for future cycles
The pixel2 theme is consistent across every surface audited: all interactive elements carry
hover/pressed/focus-visible states, `group`-reveals are paired with `group-focus-within`,
dialog Escape/backdrop/scroll-lock contracts hold, labels/`htmlFor` ids resolve, and no
off-theme hex or sub-12px text exists. There is no remaining "obvious" gap — treat any new
candidate with the register-first check above.
