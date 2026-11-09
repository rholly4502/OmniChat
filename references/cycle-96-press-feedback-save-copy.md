# Cycle 96 — pressed-bg contrast for momentary actions (2026-11-09)

**Commit `4f439fd`** — frontend-only, CI+Deploy green, live bundle verified.

## What & why
An audit of the full component surface (all tabs, shared chrome) found the
pixel2/WCAG/micro-interaction floor already highly consistent: every
hover/active control carries a `transition`, every hover has a press state,
focus-visible rings and 44px touch targets are universal, page/dialog/drawer
entrances share `pixel-reveal`, loading states share `ScanLoader` + `role="status"`,
scrollbars are themed, and `prefers-reduced-motion` is global.

The one genuine gap: a handful of **momentary** actions had a hover background
but only a translate press — no pressed-color change ("state aktif vs
nonaktif kontras"). Fixed the two clearest, where the token register supports a
real pressed step:

- **CodeBlock copy button** (`CodeBlock.tsx`): base `bg-chill-elevated`,
  hover `bg-chill-border` (lightens) → press `active:bg-chill-surface`
  (darkens below base). Distinct sunk-in pressed state.
- **JobsView "Simpan" follow-up button** (`JobsView.tsx`): hover
  `bg-chill-accent/20` → press `active:bg-chill-accent/30` (deepens the
  accent tint past hover).

Selection-semantics tabs/filter pills (aria-selected toggles) are intentionally
untouched — their selected state carries the contrast, so adding an `active:bg`
there would muddy selected-vs-pressed.

## Verification
- `npx tsc --noEmit` → 0 errors.
- Frontend vitest **962/962** (961 base + 1 new JobsView press-register test),
  63 files, all green (`--pool=forks` chunks). CodeBlock test extended to pin
  `active:bg-chill-surface` + translate.
- `npm run lint` clean; `npm run build` succeeds (pre-existing chunk-size
  warning only).
- Backend build 0 warnings; `dotnet test` green (no deployment guard reads
  `JobsView.tsx`/`CodeBlock.tsx` — verified by grepping `DeploymentConfigTests.cs`).
- CI success, Deploy success; live bundle `index-Brsvq4J5.js` == local `dist/`
  exactly; bundle contains `active:bg-chill-accent/30` + `active:bg-chill-surface`
  (×1 each source site).

## Pitfall
The `patch`/`write_file` tools are blocked outside `HERMES_WRITE_SAFE_ROOT`
(`/opt/data`), so edits to `/root/OmniChat` were done via anchored Python
`str.replace` + `assert s.count(old) == 1` in a `python3 - << 'PY'` heredoc.
