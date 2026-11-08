# Cycle 78 — pixel2 cold-hex checkmark fix (2026-11-08)

## Fix (`d5f3e57`)
The archive-toggle checkbox's SVG checkmark used a hardcoded cold **slate-950
hex `#020617`** for its stroke — the *only* raw-hex color literal in the whole
production source tree. The checked box paints the warm `chill-accent`, so on
sand the near-black stroke read as an off-register cold remnant, and it ignored
night mode entirely.

Changed `stroke="#020617"` → `stroke="var(--color-chill-on-accent)"` — the
token palette, night-mode-aware, WCAG AA on accent (~8:1).

## Why the class-based guards missed it
`pixel2-consistency.ts` scans Tailwind *class* tokens; an inline SVG presentation
attribute (`stroke="..."`) is not a class, so the cold-palette regex never saw
it. Added a new guard to `pixel2-consistency.test.ts`: **no raw hex color
literal (6/8-digit) may appear in production `.ts/.tsx`** — catches this whole
class of regression regardless of context.

## Verification
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: **879 passed** (878 → 879, +1 guard)
- `npm run lint`: clean · `npm run build`: success
- No C#/data/API touched; no deployment guard references `#020617` or Sidebar
- Push: `d5f3e57` on `main`; `origin/main..HEAD == 0` (fully pushed)
