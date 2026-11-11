import type { ExpenseItem } from './expensesApi';

export interface WeekRow {
  /** Monday of the ISO week, as YYYY-MM-DD. */
  key: string;
  start: Date;
  end: Date;
  /** Non-Nabung spend within this week (month-filtered). */
  total: number;
}

export interface WeeklyBreakdown {
  weeks: WeekRow[];
  currentWeekKey: string | null;
}

/** Wall-clock now in WIB (UTC+7). */
function wibNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function parseTanggal(t: string): Date {
  const [y, m, d] = t.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `d` (0 = Monday … 6 = Sunday). */
function mondayOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/**
 * Splits a month's transactions into Monday-starting calendar weeks and totals each
 * week's spend. Savings deposits (kategori "Nabung") and committed lump bills
 * (kategori "Tagihan", e.g. rent) are excluded to match the backend's day-total
 * semantics (ExpenseAdviceService) and the DailySpendChart — a deposit never
 * misappears as a heavy spending week, and a single rent bill never dwarfs the
 * bar scale of every other week. Deterministic from the data — no wall-clock
 * dependence except the (injected) `today` used to highlight the current week.
 */
export function computeWeeklyBreakdown(items: ExpenseItem[], month: string, today: Date = wibNow()): WeeklyBreakdown {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));

  const totals = new Map<string, number>();
  for (const it of items) {
    if (it.kategori === 'Nabung' || it.kategori === 'Tagihan') continue;
    const wk = iso(mondayOf(parseTanggal(it.tanggal)));
    totals.set(wk, (totals.get(wk) ?? 0) + it.nominal);
  }

  const weeks: WeekRow[] = [];
  let wk = mondayOf(first);
  while (wk <= last) {
    const key = iso(wk);
    weeks.push({ key, start: wk, end: addDays(wk, 6), total: totals.get(key) ?? 0 });
    wk = addDays(wk, 7);
  }

  return { weeks, currentWeekKey: iso(mondayOf(today)) };
}
