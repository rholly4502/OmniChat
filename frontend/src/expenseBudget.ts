/**
 * Remaining-daily-budget projection for the viewed month.
 *
 * The summary exposes the month's total `sisaAnggaran` (budget − spend), and the
 * daily chart draws a reference dashed at `anggaran / daysInMonth`. Neither tells
 * the user what they can still afford per day going forward — this does: leftover
 * rupiah divided by the calendar days left in the month (including today). It is
 * only meaningful for the live month, so past/future months return null.
 */

export interface RemainingBudget {
  /** Rupiah not yet spent this month (negative ⇒ over budget). */
  sisa: number;
  /** Calendar days remaining in the month, including today (1-based). */
  daysLeft: number;
  /** `sisa / daysLeft` rounded to whole rupiah; 0 when no days remain. */
  dailyAllowance: number;
}

/** Wall-clock now in WIB (UTC+7), kept in sync with `useExpenses`. */
function wibNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/** Month key of `d` in WIB as YYYY-MM. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function remainingDailyBudget(
  month: string,
  sisaAnggaran: number,
  now: Date = wibNow(),
): RemainingBudget | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (!y || m < 1 || m > 12) return null;

  // Only the live month has a meaningful "days left" frame.
  if (month !== monthKey(now)) return null;

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate() + 1;
  const dailyAllowance = daysLeft > 0 ? Math.round(sisaAnggaran / daysLeft) : 0;
  return { sisa: sisaAnggaran, daysLeft, dailyAllowance };
}
