# Cycle 33 — token-cost estimate fix for free models (Tahap 3 chat priority 2 follow-up) — (2026-11-01)

## Bug found
The per-conversation cost estimate (`frontend/src/tokenCost.ts`) had two genuine correctness gaps:

1. **Free Direct models billed as paid.** All Direct-mode models in the catalog are OpenRouter
   free-tier endpoints (`nvidia/nemotron-3.5-lightning:free`, `meta-llama/llama-3.3-70b-instruct:free`,
   `google/gemini-2.0-flash-exp:free`). `estimateUsd` had no `:free` handling, so they matched the
   FALLBACK_RATE and the UI showed a non-zero USD estimate for a conversation that costs nothing.
2. **Default agent model id mismatch.** The catalog's default agent model id is `hermes`, but the
   rate table keyed on `hermes-default`, so it silently fell back to the conservative rate.

## Fix (`a...` pending)
- `estimateUsd`: if `model.endsWith(':free')` return `0`.
- Added `'hermes'` entry to `MODEL_RATES` (0.002 / 0.008, same as hermes-default).
- New `frontend/src/__tests__/tokenCost.test.ts` (5 tests): free-tier zero, per-model rates,
  unknown-model fallback, `formatTokens`, `formatUsd`.

## Verification
- Frontend 441 → **446** tests; `npm run lint` clean; `npm run build` clean.
- Backend untouched (467/467 baseline).
