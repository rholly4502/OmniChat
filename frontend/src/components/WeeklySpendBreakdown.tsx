import { formatRupiah, type ExpenseItem } from '../expensesApi';
import { computeWeeklyBreakdown, type WeekRow } from '../weeklyBreakdown';

interface Props {
  /** All transactions loaded for the viewed month. */
  items: ExpenseItem[];
  /** Viewed month as YYYY-MM. */
  month: string;
  /** Wall-clock "today" (WIB). Injected for deterministic tests. */
  today?: Date;
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function fmtDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]}`;
}

function fmtRange(start: Date, end: Date): string {
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/**
 * Weekly spend breakdown for the viewed month: one row per calendar week (Monday
 * start), with its spend total and a bar scaled to the busiest week. The current
 * week is highlighted — this maps to the weekly review rhythm the ledger is
 * reconciled on (Senin–Sabtu), where day/month panes don't show the week as a unit.
 */
export function WeeklySpendBreakdown({ items, month, today }: Props) {
  const { weeks, currentWeekKey } = computeWeeklyBreakdown(items, month, today);
  const maxTotal = Math.max(...weeks.map((w) => w.total), 1);
  const hasAny = weeks.some((w) => w.total > 0);

  if (!hasAny) {
    return (
      <div className="flex items-center gap-2 text-sm text-chill-muted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
          className="w-4 h-4 shrink-0 text-chill-accent"
        >
          <path d="M5 19v-5M12 19V9M19 19v-9" />
        </svg>
        <span>Belum ada pengeluaran mingguan yang tercatat.</span>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {weeks.map((w: WeekRow) => {
        const current = w.key === currentWeekKey;
        return (
          <li key={w.key} data-testid={`week-${w.key}`} className="relative">
            <div className={`flex items-center justify-between gap-3 text-sm ${current ? 'text-chill-text' : 'text-chill-muted'}`}>
              <span className="tabular-nums">{fmtRange(w.start, w.end)}</span>
              <span className="inline-flex items-center gap-2">
                {current && (
                  <span className="text-xs leading-none uppercase tracking-wide pixel-heading text-chill-bg bg-chill-accent border border-chill-accent px-1.5 py-0.5">
                    Minggu ini
                  </span>
                )}
                <span className="tabular-nums font-medium text-chill-text">{formatRupiah(w.total)}</span>
              </span>
            </div>
            <div className="mt-1 h-[6px] bg-chill-border/40 border border-chill-border/50" aria-hidden="true">
              <div
                className={`relative h-full ${current ? 'bg-chill-accent' : 'bg-chill-accent/50'}`}
                style={{ width: `${Math.round((w.total / maxTotal) * 100)}%` }}
              >
                {/* Hard top-left bevel (pixel meter register) — matches the daily/trend bars. */}
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
