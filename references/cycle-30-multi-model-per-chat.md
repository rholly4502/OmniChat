# Cycle 30 — multi-model per chat (Tahap 3 chat priority 3) — DONE (2026-10-31)

Commit `c9eb526`. CI green (37s), Deploy green (1m0s), live bundle `index-CY_LkamJ.js`
matches local `dist/index.html` exactly; `/health` → 200 JSON Healthy.

## What shipped

The chat model was global state in `App.tsx`, shared across every conversation. Now it is
**per-conversation**:

- **Backend** — `IChatHistoryRepository.SetConversationModelAsync(id, userId, model)`:
  owner-scoped update; returns false when not found / not owned; no-op (no `UpdatedAt`
  bump) when the model is unchanged. `ChatTurnRecorder.StartTurnAsync` calls it on every
  turn appended to an *existing* thread, so switching model mid-conversation persists the
  switch and resuming the thread resumes with the model it last used. The call is isolated
  in its own try/catch: a model-persist failure must never lose the just-filed user turn.
- **Frontend** — `ChatSession.model` added; `useServerHistory` maps it from both the list
  (summary) and transcript (detail) responses. `App.tsx`: on session select, restore the
  stored model (`if (session?.model) setModel(session.model)`); on New chat, reset to
  `DEFAULT_MODEL`. The header/sidebar model indicator is therefore per-conversation.

## Tests

- Backend 441 → **446**: repo update-model / unowned-false / no-op-no-bump; recorder
  persists-new-model / keeps-model-when-unchanged.
- Frontend 383 → **388**: useServerHistory carries model into rows + adopts transcript model
  on select; App-level test that resuming a conversation applies that conversation's model.
- Lint clean, `npm run build` clean.

## Pitfall — a session-row click matches many buttons

An App-level test failed with "multiple elements" on
`screen.getByRole('button', { name: /Deploy/ })`: the session row is a button, but its
accessible-name siblings (`Ekspor Deploy`, `Sematkan Deploy`, `Ganti nama Deploy`, …) all
contain the title. Use an **exact** name — `{ name: 'Deploy' }` — not a regex.

## Next roadmap item

Priority 4: message actions (like/dislike, copy JSON, export conversation to PDF/CSV).
