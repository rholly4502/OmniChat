import type { ExpenseWritePayload, ExpenseItem } from './expensesApi';

/** Normalize a keterangan for duplicate comparison: lowercase, collapsed whitespace. */
function normalizeKeterangan(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Finds an existing row that would be an accidental duplicate of `payload`
 * (same date, kategori, nominal, and normalized keterangan). Returns the matched
 * row, or null. `excludeId` skips the row being edited so an edit that keeps a
 * row's own values is never flagged as a duplicate of itself.
 *
 * Conservative by design: only an exact multi-field match warns, so legitimate
 * distinct purchases (e.g. two same-day jajan entries with different amounts) are
 * never blocked. Only the currently-loaded month's rows are visible here — the
 * realistic double-entry window.
 */
export function findDuplicateExpense(
  payload: ExpenseWritePayload,
  items: readonly ExpenseItem[],
  excludeId?: number,
): ExpenseItem | null {
  const tanggal = payload.tanggal;
  const kategori = payload.kategori;
  const nominal = payload.nominal;
  const keterangan = normalizeKeterangan(payload.keterangan);
  return (
    items.find(
      (i) =>
        i.id !== excludeId &&
        i.tanggal === tanggal &&
        i.kategori === kategori &&
        i.nominal === nominal &&
        normalizeKeterangan(i.keterangan) === keterangan,
    ) ?? null
  );
}
