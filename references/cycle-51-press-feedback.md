## Cycle 51 — press/tactile feedback parity (2026-11-06)

Frontend 760 → **764**, tsc 0 errors, lint clean, build OK.

The pixel2 theme/a11y floor was already enforced app-wide; the remaining gap was
**click feedback parity** — several interactive controls had hover/focus but no
`active` (pressed) state, unlike the primary Send/Stop/sidebar buttons. This cycle
added class-only `active:` tokens (existing chill palette, no new colors/radius):

- **JobsView**: filter toggle, type/status filter tabs, error retry, and the
  "Lihat lowongan" link now get `active:translate-y-[2px]` (+ active bg on the
  grouped controls) for tactile press feedback; tabs also keep a clear active-vs-
  inactive contrast.
- **ChatHeader**: copy/export/audit/stats icon buttons get `active:bg-chill-elevated`.
- **Sidebar**: session export/pin/rename/delete icon buttons get `active:bg-chill-
  elevated` (delete uses `active:bg-chill-red/10`).
- **MessageList**: in-transcript search toolbar prev/next/close get `active:bg-
  chill-elevated`.
- **MobileTopBar**: guest logout gets `active:text-chill-accent`.

All changes are class-only; `prefers-reduced-motion` still globally zeroes
transition/animation durations via index.css. No backend/data changes, so backend
suite (543) is unaffected and CI covers it on push.

### Verification
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 55 files / 764 passed (incl. a11y-typography + pixel2
  consistency guards)
- `npm run lint` → clean; `npm run build` → OK (dist/index-5sW-UZtI.js)
