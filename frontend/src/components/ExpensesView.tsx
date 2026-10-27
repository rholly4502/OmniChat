import { formatRupiah } from '../expensesApi';
import { useExpenses } from '../hooks/useExpenses';
import type { ExpenseItem } from '../expensesApi';

/** Props accepted by {@link ExpensesView}. */
export interface ExpensesViewProps {
  /** Backend API key; sent as `X-Api-Key` on every expenses request. */
  apiKey?: string;
}

const CATEGORY_ORDER = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Nabung', 'Lain'];

function KategoriBadge({ kategori }: { kategori: string }) {
  return (
    <span className="shrink-0 rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
      {kategori}
    </span>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'cyan' | 'emerald' | 'red' }) {
  const toneClass =
    tone === 'cyan' ? 'text-cyan-300' : tone === 'emerald' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-slate-100';
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

/** The Pengeluaran page: month picker, summary cards, per-category totals, transactions. */
export function ExpensesView({ apiKey }: ExpensesViewProps) {
  const { month, setMonth, summary, items, total, loading, error, reload } = useExpenses(apiKey);

  const hasData = (summary !== null && summary.total > 0) || items.length > 0;
  const showSummary = summary !== null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overscroll-y-contain bg-slate-950 text-slate-100">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-800/70 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-100">Pengeluaran</h2>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Bulan
          <input
            type="month"
            aria-label="Bulan pengeluaran"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-base md:text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 min-h-[44px] text-slate-100"
          />
        </label>
      </header>

      <div className="flex-1 px-4 py-4 space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={reload}
              className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/15 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              Coba lagi
            </button>
          </div>
        )}

        {loading && !showSummary && !error && (
          <p className="text-sm text-slate-400 text-center py-10" role="status">
            Memuat data pengeluaran…
          </p>
        )}

        {showSummary && (
          <>
            <section aria-label="Ringkasan bulanan" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Pengeluaran" value={formatRupiah(summary!.total)} tone="cyan" />
              <StatCard
                label="Anggaran"
                value={summary!.anggaran !== null ? formatRupiah(summary!.anggaran!) : '—'}
              />
              <StatCard
                label="Sisa Anggaran"
                value={summary!.sisaAnggaran !== null ? formatRupiah(summary!.sisaAnggaran!) : '—'}
                tone={summary!.sisaAnggaran !== null && summary!.sisaAnggaran < 0 ? 'red' : 'emerald'}
              />
              <StatCard
                label="Target Nabung"
                value={summary!.targetNabung !== null ? formatRupiah(summary!.targetNabung!) : '—'}
              />
            </section>

            {summary!.anggaran !== null && summary!.anggaran > 0 && (
              <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${summary!.total > summary!.anggaran! ? 'bg-red-500' : 'bg-cyan-500'}`}
                  style={{ width: `${Math.min(100, Math.round((summary!.total / summary!.anggaran!) * 100))}%` }}
                />
              </div>
            )}

            {summary!.catatan ? (
              <p className="text-xs text-slate-400">{summary!.catatan}</p>
            ) : null}

            <section aria-label="Total per kategori">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Total per Kategori</h3>
              {Object.keys(summary!.perKategori).length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada pengeluaran tercatat di bulan ini.</p>
              ) : (
                <CategoryBreakdown perKategori={summary!.perKategori} />
              )}
            </section>

            <section aria-label="Daftar transaksi">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                Transaksi ({total})
              </h3>
              {items.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada transaksi.</p>
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
          <p className="text-sm text-slate-400 text-center py-10">Belum ada data.</p>
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
          <span className="w-20 shrink-0 text-sm text-slate-300">{kategori}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${Math.max(4, Math.round((amount / max) * 100))}%` }} />
          </div>
          <span className="w-28 text-right text-sm tabular-nums text-slate-100">{formatRupiah(amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function TransactionRow({ item }: { item: ExpenseItem }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5">
      <div className="shrink-0 text-center leading-tight w-14">
        <div className="text-sm font-medium text-slate-200 tabular-nums">{item.tanggal.slice(8, 10)}</div>
        <div className="text-xs text-slate-400 tabular-nums">{item.tanggal.slice(5, 7)}/{item.tanggal.slice(0, 4)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <KategoriBadge kategori={item.kategori} />
          {item.waktu && <span className="text-xs text-slate-400 tabular-nums">{item.waktu}</span>}
        </div>
        {item.keterangan && (
          <p className="mt-0.5 text-sm text-slate-300 truncate">{item.keterangan}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium text-slate-100 tabular-nums">{formatRupiah(item.nominal)}</span>
    </li>
  );
}
