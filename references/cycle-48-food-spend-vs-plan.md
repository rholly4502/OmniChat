# Cycle 48 (2026-11-06) — food spend vs frugal-menu plan (evaluation mode)

`1513f92` (feature) + `78f32f7` (ledger mirror sync). BE 535/535, FE 755/755,
lint/build clean, CI+Deploy green, live bundle `index-DttaW26_.js` == local dist.

## What & why
P1-6's rotating daily-menu card gave a frugal plan but never checked it against reality.
Closed the loop: `ExpenseAdviceService` now computes `foodSpend` (kategori Makan on the
analysed date) and carries each menu set's numeric cost range (`BiayaMin/Max`). `AdvicePanel`
renders a red callout when the day's food spend exceeds the plan top, a sage confirmation when
within, nothing when no food is recorded. Ground-truth feedback tied to both stated goals
(hemat + turun berat badan).

## Key facts
- `Menus` tuples grew a `(int Min, int Max)` per set, matching each display `±Rp…` string.
- `FoodSpend` counts only kategori `Makan` on the exact date; non-food categories and other
  days are excluded (unit test pins this).
- Frontend reading of `biayaMin/Max`/`foodSpend` is safe across the deploy window: if the new
  fields are absent (old backend), `foodSpend > 0` is false → renders nothing extra.

## Pitfall — verifying a deploy without `gh`/token in the sandbox
No `gh` binary, no GITHUB_TOKEN, HTTPS API needs auth (private repo). The relieve pipeline
asserts `Deployed commit == pushed SHA` and fails loudly otherwise, so a live bundle that
matches local `dist/index.html` is strong evidence the whole push (CI + backend + frontend)
shipped. Recipe:
- `grep -o 'assets/index-[^"]*\.js' frontend/dist/index.html` → expected asset.
- Poll `https://rhol-ai.tech/` until the `assets/index-*` reference equals it (allow a
  transient 5xx/HTTPError during the container swap, ~60–90s).
- Then `/health` → 200 `application/json` (backend healthy post-reset) and `/api/models` →
  401 `application/problem+json` (auth intact).
- Also grep the local dist bundle for a new UI string (count 1) to prove the component shipped.
