# Cycle 66 — range-slider keyboard focus ring (2026-11-07)

Frontend-only UI/UX polish: the Temperature / Max Tokens sliders in the sidebar
(Settings > Parameter & Persona) were the last interactive controls with **no
visible keyboard focus indicator**. `input[type='range']` already forced
`appearance: none` (pixel2 track/thumb styling), which strips the browser's
default focus ring, so a keyboard user got zero cue on those two controls.

## Change

`frontend/src/index.css` — added:

```css
input[type='range']:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-chill-accent) 60%, transparent);
}
```

- Matches the app's existing `focus-visible:ring-2 focus-visible:ring-chill-accent/60`
  ring language (chill accent @ 60%) — same token, same visual weight.
- Pure color change on focus — no animation, so `prefers-reduced-motion` is
  unaffected.
- Uses existing `--color-chill-accent` token; no new color, no soft corner/soft
  shadow (box-shadow ring is the same technique `ring-2` uses; `pixel2-css-consistency`
  anti-pattern checks still pass).

## Guard added

`pixel2-css-consistency.test.ts` gained a `pixel2 range-slider focus ring` describe
block asserting the rule exists and uses the 60% chill-accent mix, so a future
regression that strips the focus ring (or changes it to a cold/soft style) fails.

## Verification

- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **846** passed (was 845; +1 new guard)
- `npm run lint` → clean
- `npm run build` → success (`dist/assets/index-Bt_jnE63.js`)
- `dotnet test tests/OmniChat.Tests` → **578/578** passed (no backend change; guards fine)
