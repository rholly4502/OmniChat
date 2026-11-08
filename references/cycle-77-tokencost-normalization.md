# Cycle 77 — cost-estimate layer: provider-prefixed id resolution + pricing coverage (2026-11-08)

**Commit `37ffc9e`**, CI green, Deploy green, live bundle `index-DUdgLoio.js` matches local dist.

The chat/cost roadmap (Tahap 3 items 1–6 + P2/P3) is complete — this cycle improved the
cost-estimation layer that backs every token/cost readout (header, mobile top bar, per-message
footnotes, audit + stats dialogs).

## Changes (frontend only, `frontend/src/tokenCost.ts` + its test)
1. **Provider-prefixed id resolution** — `getModelRate` now falls back to the bare family name
   (`openai/gpt-4o` → `gpt-4o`, `anthropic/claude-sonnet` → `claude-sonnet`) so direct-mode
   OpenRouter-style ids price against the correct known rate instead of the conservative fallback.
2. **Expanded pricing table** — added `gpt-4.1`, `gpt-4.1-mini`, `claude-opus-4`,
   `deepseek-chat`, `gemini-2.0-flash` (published list-price ballparks).
3. **Non-mutating cost sort** — `sortModelEntriesByCost` now sorts a copy (`[...entries]`)
   instead of mutating the caller's array; a test pins that the input is untouched.

## Verification
- Frontend **878/878** (+4 new tests), lint clean, build clean.
- Backend **583/583** (unchanged — frontend-only).
- Live: `/health` 200 Healthy; `/api/models` 401; live bundle hash == local `dist` exactly.
- CI + Deploy rows green for `37ffc9e`.

## Lessons
- Reading a mature codebase: the roadmap items all exist (regenerate/edit, per-conversation
  cost, multi-model per thread, feedback, export menu, filtered search, richer typing status);
  before adding new features, verify what already ships.
- Running `npm test` baseline before choosing the change confirmed 874 passing; the +4 new
  assertions are the only delta this cycle.
