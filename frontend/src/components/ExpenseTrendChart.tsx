import { formatRupiah, type ExpenseTrendPoint } from '../expensesApi';
import { shortMonth } from '../expenseTrendFormat';

interface Props {
  points: ExpenseTrendPoint[];
}

/** Pixel-style bar chart of monthly spend over the trailing months. */
export function ExpenseTrendChart({ points }: Props) {
  if (points.length === 0) {
    // Barren-state register: a faint pixel step-up icon (same empty-state grammar
    // as the page-level ornament) so the empty line isn't stark text.
    return (
      <div className="flex items-center gap-2 text-sm text-chill-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
          <path d="M4 19h16M5 15l4-4 3 3 5-6" />
        </svg>
        <span>Belum ada data tren.</span>
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.total));

  return (
    <div
      role="img"
      aria-label="Tren pengeluaran bulanan"
      className="flex items-end gap-2 h-40 px-1"
    >
      {points.map((p) => {
        const height = p.total > 0 ? Math.max(6, Math.round((p.total / max) * 100)) : 0;
        return (
          <div key={p.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="flex-1 w-full flex items-end justify-center">
              {p.total > 0 ? (
                <div
                  className="relative w-full max-w-[26px] bg-chill-accent border border-chill-accent/60 pixel-shadow-sm"
                  style={{ height: `${height}%` }}
                  title={`${shortMonth(p.month)} ${formatRupiah(p.total)}`}
                >
                  {/* Hard top-left bevel (pixel meter register): a chunky light
                      edge like the resource bars — no soft gradient. */}
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />
                </div>
              ) : (
                <div className="w-full max-w-[26px] bg-chill-border/40 border border-chill-border/40" style={{ height: '6px' }} />
              )}
            </div>
            <span className="text-xs leading-none text-chill-muted tabular-nums">{shortMonth(p.month)}</span>
          </div>
        );
      })}
    </div>
  );
}
