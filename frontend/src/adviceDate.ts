/**
 * WIB (UTC+7) date helpers for the expenses "Analisa & Saran" panel.
 *
 * The rest of the expenses surface (ExpenseForm default date, remainingDailyBudget,
 * the backend's TodayWib) is standardised on WIB, so the panel's "today"/"this
 * month" must follow the same frame instead of the client's timezone.
 */

/** Wall-clock now in WIB (UTC+7), matching the ledger/expense-form frame. */
function wibNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/**
 * Picks the date to analyse: today when the month is current, else the month's
 * last day. Computed in WIB so "today" lines up with the ledger and the rest of
 * the expenses UI (ExpenseForm, remainingDailyBudget, backend) regardless of the
 * client's timezone.
 */
export function analyseDate(month: string, now: Date = wibNow()): string {
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (month === currentMonth) {
    return `${month}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}
