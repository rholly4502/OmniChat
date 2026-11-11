import { formatRupiah, type ExpenseItem } from '../expensesApi';

interface Props {
  /** All transactions loaded for the viewed month. */
  items: ExpenseItem[];
  /** Viewed month as YYYY-MM. */
  month: string;
  /** Monthly budget for the viewed month (null when unset). */
  anggaran: number | null;
  /** Active day count for a partial-month target (null/omitted = full month). */
  hari?: number | null;
}

/** Days in `month` (YYYY-MM). Uses the JS Date rollover: day 0 of the month that
    follows `month` is the last day of `month`. */
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Mirror of the backend's daily budget (ExpenseAdviceService): anggaran divided by
    the effective day count, rounded to at least 1. A partial-month target declares
    its active days (Hari); otherwise the calendar month length is used. Null when
    no budget is set. */
function dailyBudgetFor(anggaran: number | null, days: number): number | null {
  return anggaran && anggaran > 0 ? Math.max(1, Math.round(anggaran / days)) : null;
}

/**
 * Intra-month spending chart: one bar per day of the viewed month, scaled to the
 * busiest day, with a stepped pixel-dash reference line at the daily budget (when a monthly
 * budget is set). Savings deposits (kategori "Nabung") and committed lump bills
 * (kategori "Tagihan", e.g. rent) are excluded to match the backend's day-total
 * semantics (ExpenseAdviceService) — a rent day is a committed bill, not a
 * discretionary spend that should flag the day over its daily budget or dominate
 * the bar scale.
 */
export function DailySpendChart({ items, month, anggaran, hari }: Props) {
  const dim = daysInMonth(month);

  const byDay = new Map<number, number>();
  for (const it of items) {
    if (it.kategori === 'Nabung' || it.kategori === 'Tagihan') continue;
    const day = Number(it.tanggal.slice(8, 10));
    if (Number.isFinite(day)) byDay.set(day, (byDay.get(day) ?? 0) + it.nominal);
  }

  const dayTotals = Array.from({ length: dim }, (_, i) => byDay.get(i + 1) ?? 0);
  const spent = dayTotals.reduce((a, b) => a + b, 0);

  if (spent === 0) {
    // Barren-state register: a faint pixel bar-columns icon so the empty line
    // reads as part of the page's empty-state grammar, not stark text.
    return (
      <div className="flex items-center gap-2 text-sm text-chill-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
          <path d="M5 19v-5M12 19V9M19 19v-9" />
        </svg>
        <span>Belum ada pengeluaran harian yang tercatat.</span>
      </div>
    );
  }

  const effectiveDays = hari && hari > 0 ? hari : dim;
  const budget = dailyBudgetFor(anggaran, effectiveDays);
  const chartMax = Math.max(...dayTotals, budget ?? 0, 1);

  return (
    <div>
      {budget !== null && (
        <p className="mb-2 text-xs text-chill-muted tabular-nums">
          Garis putus-putus = anggaran harian ({formatRupiah(budget)})
        </p>
      )}
      <div role="img" aria-label="Pengeluaran per hari" className="relative h-40">
        {budget !== null && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 z-10 h-[2px] pixel-dash-line"
            style={{ bottom: `${(budget / chartMax) * 100}%` }}
          />
        )}
        <div className="absolute inset-0 flex items-end gap-px px-1">
          {dayTotals.map((total, i) => {
            const day = i + 1;
            const over = budget !== null && total > budget;
            const height = total > 0 ? Math.max(4, Math.round((total / chartMax) * 100)) : 0;
            return (
              <div key={day} data-testid={`day-${day}`} className="flex-1 min-w-0 h-full flex items-end justify-center">
                {total > 0 ? (
                  <div
                    className={`relative w-full max-w-[10px] md:max-w-[16px] border ${
                      over ? 'bg-chill-red/70 border-chill-red' : 'bg-chill-accent border-chill-accent/60'
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${day} ${month}: ${formatRupiah(total)}`}
                  >
                    {/* Hard top-left bevel (pixel meter register) — no soft gradient. */}
                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />
                  </div>
                ) : (
                  <div className="w-full max-w-[10px] md:max-w-[16px] h-[3px] bg-chill-border/40" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Day-axis: sparse pixel tick labels aligned to the same column grid — the
          chart is readable without hovering (the 12px floor is kept). */}
      <div aria-hidden="true" data-testid="day-axis" className="mt-1 flex gap-px px-1 select-none">
        {dayTotals.map((_, i) => {
          const day = i + 1;
          const show = day === 1 || day % 5 === 0 || day === dim;
          return (
            <div key={day} className="flex-1 min-w-0 text-center">
              {show ? (
                <span className="text-xs leading-none text-chill-muted/75 tabular-nums">{day}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
