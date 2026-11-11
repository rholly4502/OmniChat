# Cycle 100 — Composer disabled Send inactive state (2026-11-11)

Commit `6b1696f` (frontend only). Live bundle `index-BBDkV_tb.js` matches local dist; backend fresh (uptime reset).

## What changed
Composer's primary **Kirim** button is `disabled` on an empty/whitespace draft. Previously it
retained the raised `pixel-shadow` and lit up via `hover:bg-chill-accent-hover` even while
disabled — a disabled primary control that still looked/lit pressable.

Added explicit inactive-state variants so it reads unpressable:
- `disabled:shadow-none` — drop the hard pixel shadow (it was suggesting a press surface).
- `disabled:hover:bg-chill-accent` — keep the base accent on hover so a disabled button does
  not brighten (CSS `:hover` matches disabled buttons, so `hover:` alone still fired).
- `disabled:cursor-not-allowed` — matches the ExpensesView disabled convention.

Base `bg-chill-accent` / `pixel-shadow` / `rounded-none` unchanged, so the enabled state is
untouched.

## Verification
- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — 64 files / **1060 tests** pass, incl. new
  `Composer disabled Send state` test (asserts `disabled:opacity-40`,
  `disabled:cursor-not-allowed`, `disabled:shadow-none`, `disabled:hover:bg-chill-accent`,
  and preserved base accent/shadow/square).
- `npm run lint` — 0 warnings. `npm run build` — success (chunk-size warning pre-existing,
  jsPDF/html2canvas).
- `dotnet test tests/OmniChat.Tests -c Release` — **645/645** pass.
- Live: bundle hash match, `/health` → `{"status":"Healthy",...}`; bundle contains
  `disabled:shadow-none` (×2) and `disabled:hover:bg-chill-accent` (×1).

## Notes
- No C# source-text guard references the Composer Send classes; backend suite green untouched.
- The same hover-while-disabled pattern exists on other disabled primary buttons (e.g.
  LoginScreen submit); left untouched this cycle to stay surgical — revisit if the register
  should be app-wide.
