import { formatRupiah, type ExpenseTrendPoint } from '../expensesApi';
import { shortMonth } from '../expenseTrendFormat';

interface Props {
  points: ExpenseTrendPoint[];
}

/** Warm pixel palette keyed by ledger category (kategori) for the stacked trend bars. */
const CATEGORY_FILL: Record<string, string> = {
  Makan: 'bg-chill-accent',
  Transport: 'bg-chill-deepsea',
  Belanja: 'bg-chill-sage',
  Tagihan: 'bg-chill-red/70',
  Kesehatan: 'bg-chill-muted',
  Hiburan: 'bg-chill-text/60',
  Lain: 'bg-chill-border',
};

function fillFor(kategori: string): string {
  return CATEGORY_FILL[kategori] ?? 'bg-chill-border';
}

/** Per-category rows for a month, ascending by total so the largest segment sits
    at the base of the stacked bar (stable, readable order regardless of API order). */
function ascendingCategories(p: ExpenseTrendPoint) {
  return [...(p.categories ?? [])].sort((a, b) => a.total - b.total);
}

/**
 * Pixel-style bar chart of monthly spend over the trailing months. When the
 * backend supplies per-category data, each bar is stacked by category (warm
 * palette + legend); otherwise it falls back to a solid accent bar.
 */
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

  // Union of every category seen across the window, for the legend, in first-seen order.
  const legendCats: string[] = [];
  for (const p of points) {
    for (const c of p.categories ?? []) {
      if (!legendCats.includes(c.kategori)) legendCats.push(c.kategori);
    }
  }

  return (
    <div>
      <div role="img" aria-label="Tren pengeluaran bulanan" className="flex items-end gap-2 h-40 px-1">
        {points.map((p) => {
          const height = p.total > 0 ? Math.max(6, Math.round((p.total / max) * 100)) : 0;
          const segs = ascendingCategories(p);
          return (
            <div key={p.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="flex-1 w-full flex items-end justify-center">
                {p.total > 0 ? (
                  segs.length > 0 ? (
                    <div
                      className="relative w-full max-w-[26px] flex flex-col border border-chill-accent/40 pixel-shadow-sm"
                      style={{ height: `${height}%` }}
                    >
                      {segs.map((s, i) => (
                        <div
                          key={i}
                          className={`relative w-full ${fillFor(s.kategori)}${i < segs.length - 1 ? ' border-b border-black/25' : ''}`}
                          style={{ height: `${Math.round((s.total / p.total) * 100)}%` }}
                          title={`${s.kategori}: ${formatRupiah(s.total)} · ${shortMonth(p.month)}`}
                        >
                          {/* Hard top-left bevel (pixel meter register) on the topmost segment */}
                          {i === 0 && <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="relative w-full max-w-[26px] bg-chill-accent border border-chill-accent/60 pixel-shadow-sm"
                      style={{ height: `${height}%` }}
                      title={`${shortMonth(p.month)} ${formatRupiah(p.total)}`}
                    >
                      {/* Hard top-left bevel (pixel meter register): a chunky light
                          edge like the resource bars — no soft gradient. */}
                      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />
                    </div>
                  )
                ) : (
                  <div className="w-full max-w-[26px] bg-chill-border/40 border border-chill-border/40" style={{ height: '6px' }} />
                )}
              </div>
              <span className="text-xs leading-none text-chill-muted tabular-nums">{shortMonth(p.month)}</span>
            </div>
          );
        })}
      </div>
      {legendCats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {legendCats.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-xs text-chill-muted">
              <span aria-hidden="true" className={`h-2 w-2 ${fillFor(k)} border border-chill-border/60`} />
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
