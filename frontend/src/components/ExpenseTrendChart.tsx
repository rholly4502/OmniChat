import { formatRupiah, type ExpenseTrendPoint } from '../expensesApi';
import { shortMonth } from '../expenseTrendFormat';

interface Props {
  points: ExpenseTrendPoint[];
}

/** Pixel-style bar chart of monthly spend over the trailing months. */
export function ExpenseTrendChart({ points }: Props) {
  if (points.length === 0) {
    return <p className="text-sm text-chill-muted">Belum ada data tren.</p>;
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
                  className="w-full max-w-[26px] bg-chill-accent border border-chill-accent/60 pixel-shadow-sm"
                  style={{ height: `${height}%` }}
                  title={`${shortMonth(p.month)} ${formatRupiah(p.total)}`}
                />
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
