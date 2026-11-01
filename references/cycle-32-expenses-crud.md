# Cycle 32 — P1-4/P1-5: add/edit/delete expenses from web (2026-11-01)

Commit `b563c07`, CI green, Deploy green, live bundle hash matched, backend 453→467,
frontend 432→441, lint/build clean.

## What shipped
- Backend write endpoints on `ExpensesController`:
  - `POST /api/expenses` (created `web-`+8hex SourceId so the ledger self-healing
    importer never touches web rows)
  - `PUT /api/expenses/{id:long}`, `DELETE /api/expenses/{id:long}`
  - Validation: YYYY-MM-DD date, kategori ∈ StandardCategories (8), nominal > 0,
    keterangan ≤ 500. 400 ProblemDetails on failure; 404 for missing id.
  - Auth: these routes are NOT guest-exempt → 401 without X-Api-Key (verified live).
- Repository write methods on `ExpenseRepository` + `IExpenseRepository`:
  `GetByIdAsync`, `AddAsync`, `UpdateAsync`, `DeleteAsync`.
- Frontend: inline `ExpenseForm` (Tambah/Edit) in `ExpensesView.tsx`; per-row
  Edit (`✎`) and Hapus (`🗑`) buttons; `createExpense/updateExpense/deleteExpense`
  in `expensesApi.ts`; reload after each mutation.

## Ledger sync (P1-1)
Staging already in sync with Tools-Private (contents SAME, staging mtimes newer).
October total from staged CSV = 979,000, which still matches the seed workflow's
assertion (the two 2026-11-01 rows are correctly excluded from Oct summary).

## Key pitfalls hit
- **Response constructor rejects status 204 with a body** → use `new Response(null, {status:204})`.
- **Python `<< 'PY'` heredoc eats C# backslash escapes** — `Assert.Contains("[HttpPut("{id:long}")]")`
  became unescaped quoted text. Fix: double-escape in Python (`\\"`) so the file
  gets `\"`.

## Evaluation-mode note
P1-4 + P1-5 fully implemented and green. The "record to Tools-Private too" ideal is
not feasible from the web backend (VPS container cannot push to the private repo);
web rows are isolated via the `web-` SourceId prefix so they survive re-seeds and are
never mistaken for income.
