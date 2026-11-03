import { formatRupiah, type ExpenseItem } from '../expensesApi';

interface Props {
  /** All transactions loaded for the viewed month. */
  items: ExpenseItem[];
  /** Viewed month as YYYY-MM. */
  month: string;
  /** Monthly budget for the viewed month (null when unset). */
  anggaran: number | null;
}

/** Days in `month` (YYYY-MM). Uses the JS Date rollover: day 0 of the month that
    follows `month` is the last day of `month`. */
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Mirror of the backend's daily budget (ExpenseAdviceService): anggaran divided by
    days-in-month, rounded to at least 1. Null when no budget is set. */
function dailyBudgetFor(anggaran: number | null, dim: number): number | null {
  return anggaran && anggaran > 0 ? Math.max(1, Math.round(anggaran / dim)) : null;
}

/**
 * Intra-month spending chart: one bar per day of the viewed month, scaled to the
 * busiest day, with a stepped pixel-dash reference line at the daily budget (when a monthly
 * budget is set). Savings deposits (kategori "Nabung") are excluded to match the
 * backend's day-total semantics.
 */
export function DailySpendChart({ items, month, anggaran }: Props) {
  const dim = daysInMonth(month);

  const byDay = new Map<number, number>();
  for (const it of items) {
    if (it.kategori === 'Nabung') continue;
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

  const budget = dailyBudgetFor(anggaran, dim);
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
            className="absolute inset-x-0 z-10 h-[2px]"
            style={{
              bottom: `${(budget / chartMax) * 100}%`,
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--color-chill-accent) 0 6px, transparent 6px 12px)',
              opacity: 0.65,
            }}
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
    </div>
  );
}
