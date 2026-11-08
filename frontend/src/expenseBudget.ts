/**
 * Remaining-daily-budget projection for the viewed month.
 *
 * The summary exposes the month's total `sisaAnggaran` (budget − spend), and the
 * daily chart draws a reference dashed at `anggaran / daysInMonth`. Neither tells
 * the user what they can still afford per day going forward — this does: leftover
 * rupiah divided by the calendar days left in the month after today. Today is
 * excluded so the figure matches the advice panel's per-day allowance (whose
 * remaining-budget numerator already reflects today's spend), keeping the two
 * panels consistent instead of showing conflicting numbers on one screen. It is
 * only meaningful for the live month, so past/future months return null.
 */

export interface RemainingBudget {
  /** Rupiah not yet spent this month (negative ⇒ over budget). */
  sisa: number;
  /** Calendar days remaining in the month after today. */
  daysLeft: number;
  /** `sisa / daysLeft` rounded to whole rupiah; at least 1 day remains. */
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
  const daysLeft = Math.max(1, daysInMonth - now.getUTCDate());
  const dailyAllowance = Math.round(sisaAnggaran / daysLeft);
  return { sisa: sisaAnggaran, daysLeft, dailyAllowance };
}
