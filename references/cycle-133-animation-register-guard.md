# Cycle 133 — guard the pixel animation register against smooth `animate-*` (pixel2)

Frontend-only design-floor hardening. No production component changed; the UI
was audited end-to-end and found consistent, so this cycle closes the one
remaining guard gap rather than forcing decorative churn.

## Audit result (why a guard, not a UI change)

A full pass across every tab and shared component (Chat, Pengeluaran, Job
Opportunity, Event; sidebar, header, dialogs, popovers, composer, message
list, filters, empty/loading states) found no drift:

- zero non-zero corner radii, gradients/glows/blurs, soft (non-pixel) shadows,
  cold-palette tokens, or raw hex colours in component source;
- every interactive control has hover, `active:translate-y` press-slide,
  `focus-visible:ring`, and sits on the 44px touch floor;
- all four main views and every dialog already carry the `pixel-reveal` /
  `pixel-overlay-fade` stepped entrance; loaders use `pixel-blink` /
  `pixel-scan` / `pixel-think`;
- sub-12px text, WCAG-AA-failing colours, and iOS-zoom risks are already
  pinned by `a11y-typography.test.ts`; reduced-motion by the global media block.

The one register drift that could still slip through every rendered test: a
Tailwind `animate-*` utility (pulse/spin/ping/bounce/...) tweens with smooth
easing and renders fine, so no existing guard would catch it.

## What changed

`frontend/src/__tests__/pixel2-stepped-timing.test.ts` — new
`pixel2 animation-register consistency` describe: a source-level scan (same
scanner family as the other pixel2 guards) asserting no production component
file uses an `animate-[\w-]+` utility. Motion must come from the register's own
stepped classes (`pixel-blink`, `pixel-scan`, `pixel-think`, `pixel-reveal`,
`pixel-shine`, `pixel-overlay-fade`, `pixel-step-fade`). Verified: zero such
utilities exist today, so the guard is green and forward-protecting.

## Verification (all green)

- `npx tsc --noEmit` → 0 errors.
- `npx vitest run --pool=forks` → **68 files / 1122 passed** (1121 + 1 new guard).
- `npm run build` → succeeds (only the pre-existing >500kB jsPDF chunk note).
- Push `317c631` → React Build ✓, .NET 10 Build ✓, Deploy to VPS ✓.
- Live `assets/index-ZrCbEJNx.js` == local `dist/index.html` exactly (bundle
  unchanged, as expected for a test-only change); `/health` Healthy; `/` → 200.
