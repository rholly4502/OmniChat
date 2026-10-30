import { formatRupiah } from '../expensesApi';
import { useExpenses } from '../hooks/useExpenses';
import type { ExpenseItem } from '../expensesApi';

/** Props accepted by {@link ExpensesView}. */
export interface ExpensesViewProps {
  /** Backend API key; sent as `X-Api-Key` on every expenses request. */
  apiKey?: string;
}

const CATEGORY_ORDER = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Nabung', 'Lain'];

/** Pixel-ratio icon per category (inline SVG, stroke = currentColor). */
const CATEGORY_ICONS: Record<string, string> = {
  Makan: 'M9 3v4M15 3v4M4 7h16M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M10 12h4',
  Transport: 'M8 4h8l3 5v10h-3M5 19v-5H4v5M8 8h8M9 17h.1M15 17h.1',
  Belanja: 'M4 5h3l1.5 10M4 5L3 8m1-3h16l-1.5 10H8.5M7 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM16 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  Tagihan: 'M7 3v18M17 3v18M5 5h14M5 19h14M8 8h.1M16 8h.1M8 12h.1M16 12h.1',
  Kesehatan: 'M12 4a3 3 0 0 1 3 3c2.5 0 4 1.5 4 4 0 3-2.5 6-7 9-4.5-3-7-6-7-9 0-2.5 1.5-4 4-4a3 3 0 0 1 3-3Z',
  Hiburan: 'M6 4l12 8-12 8V4Z',
  Nabung: 'M4 6h16v12H4V6ZM6 9h.1M6 15h.1M10 12h4',
  Lain: 'M12 3l3 3-3 3M9 6h6M12 15l3 3-3 3M9 18h6',
};

function CategoryIcon({ kategori, className = '' }: { kategori: string; className?: string }) {
  const d = CATEGORY_ICONS[kategori] ?? CATEGORY_ICONS.Lain;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={`shrink-0 w-5 h-5 ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

function KategoriBadge({ kategori }: { kategori: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 rounded-none bg-chill-surface border border-chill-border px-2 py-0.5 text-xs text-chill-muted">
      <CategoryIcon kategori={kategori} className="w-3.5 h-3.5" />
      {kategori}
    </span>
  );
}

function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: string; icon: string; tone?: 'default' | 'accent' | 'emerald' | 'red' }) {
  const valueClass =
    tone === 'accent' ? 'text-chill-accent' : tone === 'emerald' ? 'text-chill-accent' : tone === 'red' ? 'text-chill-red' : 'text-chill-text';
  return (
    <div className="rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-8 text-chill-border/40 pixel-grid opacity-50" />
      <div className="relative flex items-start gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-none border flex items-center justify-center ${tone === 'red' ? 'text-chill-red border-chill-red/40 bg-chill-red/10' : tone === 'emerald' ? 'text-chill-accent border-chill-accent/40 bg-chill-accent/10' : 'text-chill-accent border-chill-accent/40 bg-chill-accent/10'}`}>
          <CategoryIcon kategori={icon} className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-chill-muted font-medium">{label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function HeaderDivider() {
  return (
    <div aria-hidden="true" className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-chill-border" />
      <div className="w-2 h-2 bg-chill-accent rotate-45" />
      <div className="h-px flex-1 bg-chill-border" />
    </div>
  );
}

/** The Pengeluaran page: month picker, summary cards, per-category totals, transactions. */
export function ExpensesView({ apiKey }: ExpensesViewProps) {
  const { month, setMonth, summary, items, total, loading, error, reload } = useExpenses(apiKey);

  const hasData = (summary !== null && summary.total > 0) || items.length > 0;
  const showSummary = summary !== null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overscroll-y-contain bg-chill-bg text-chill-text">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-chill-border flex items-center justify-between gap-3 flex-wrap relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-16 text-chill-border/40 pixel-grid opacity-40" />
        <h2 className="relative text-base font-semibold text-chill-text pixel-heading">Pengeluaran</h2>
        <label className="relative flex items-center gap-2 text-xs text-chill-muted">
          Bulan
          <input
            type="month"
            aria-label="Bulan pengeluaran"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="bg-chill-surface border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text"
          />
        </label>
      </header>

      <div className="flex-1 px-4 py-4 space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={reload}
              className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
            >
              Coba lagi
            </button>
          </div>
        )}

        {loading && !showSummary && !error && (
          <p className="text-sm text-chill-muted text-center py-10" role="status">
            Memuat data pengeluaran…
          </p>
        )}

        {showSummary && (
          <>
            <section aria-label="Ringkasan bulanan" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Pengeluaran" value={formatRupiah(summary!.total)} icon="Lain" tone="accent" />
              <StatCard
                label="Anggaran"
                value={summary!.anggaran !== null ? formatRupiah(summary!.anggaran!) : '—'}
                icon="Tagihan"
              />
              <StatCard
                label="Sisa Anggaran"
                value={summary!.sisaAnggaran !== null ? formatRupiah(summary!.sisaAnggaran!) : '—'}
                icon="Nabung"
                tone={summary!.sisaAnggaran !== null && summary!.sisaAnggaran < 0 ? 'red' : 'emerald'}
              />
              <StatCard
                label="Target Nabung"
                value={summary!.targetNabung !== null ? formatRupiah(summary!.targetNabung!) : '—'}
                icon="Kesehatan"
              />
            </section>

            {summary!.anggaran !== null && summary!.anggaran > 0 && (
              <div aria-hidden="true" className="h-2 rounded-none bg-chill-surface border border-chill-border overflow-hidden">
                <div
                  className={`h-full ${summary!.total > summary!.anggaran! ? 'bg-chill-red' : 'bg-chill-accent'}`}
                  style={{ width: `${Math.min(100, Math.round((summary!.total / summary!.anggaran!) * 100))}%` }}
                />
              </div>
            )}

            {summary!.catatan ? (
              <p className="text-xs text-chill-muted">{summary!.catatan}</p>
            ) : null}

            <HeaderDivider />

            <section aria-label="Total per kategori">
              <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-3 pixel-heading">Total per Kategori</h3>
              {Object.keys(summary!.perKategori).length === 0 ? (
                <p className="text-sm text-chill-muted">Belum ada pengeluaran tercatat di bulan ini.</p>
              ) : (
                <CategoryBreakdown perKategori={summary!.perKategori} />
              )}
            </section>

            <section aria-label="Daftar transaksi">
              <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-3 pixel-heading">
                Transaksi ({total})
              </h3>
              {items.length === 0 ? (
                <p className="text-sm text-chill-muted">Belum ada transaksi.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <TransactionRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {!loading && !error && !hasData && !showSummary && (
          <p className="text-sm text-chill-muted text-center py-10">Belum ada data.</p>
        )}
      </div>
    </div>
  );
}

function CategoryBreakdown({ perKategori }: { perKategori: Record<string, number> }) {
  const entries = Object.entries(perKategori).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const ordered = [...entries].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a[0]);
    const bi = CATEGORY_ORDER.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <ul className="space-y-2">
      {ordered.map(([kategori, amount]) => (
        <li key={kategori} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-chill-accent flex items-center justify-center">
            <CategoryIcon kategori={kategori} className="w-4 h-4" />
          </span>
          <span className="w-20 shrink-0 text-sm text-chill-text">{kategori}</span>
          <div className="flex-1 h-2.5 rounded-none bg-chill-surface border border-chill-border overflow-hidden" aria-hidden="true">
            <div className="h-full bg-chill-accent/70" style={{ width: `${Math.max(4, Math.round((amount / max) * 100))}%` }} />
          </div>
          <span className="w-28 text-right text-sm tabular-nums text-chill-text">{formatRupiah(amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function TransactionRow({ item }: { item: ExpenseItem }) {
  return (
    <li className="flex items-center gap-3 rounded-none bg-chill-surface border border-chill-border px-3 py-2.5 pixel-shadow-sm">
      <div className="shrink-0 text-center leading-tight w-14 border-r border-chill-border pr-3">
        <div className="text-sm font-medium text-chill-text tabular-nums">{item.tanggal.slice(8, 10)}</div>
        <div className="text-xs text-chill-muted tabular-nums">{item.tanggal.slice(5, 7)}/{item.tanggal.slice(0, 4)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <KategoriBadge kategori={item.kategori} />
          {item.waktu && <span className="text-xs text-chill-muted tabular-nums">{item.waktu}</span>}
        </div>
        {item.keterangan && (
          <p className="mt-0.5 text-sm text-chill-muted truncate">{item.keterangan}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium text-chill-text tabular-nums">{formatRupiah(item.nominal)}</span>
    </li>
  );
}
