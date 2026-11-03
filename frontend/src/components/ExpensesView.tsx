import { useEffect, useState } from 'react';
import {
  formatRupiah,
  exportExpensesCsv,
  exportExpensesPdf,
  createExpense,
  updateExpense,
  deleteExpense,
  type ExpenseWritePayload,
} from '../expensesApi';
import { ApiError } from '../api';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseTrend } from '../hooks/useExpenseTrend';
import { ExpenseTrendChart } from './ExpenseTrendChart';
import { DailySpendChart } from './DailySpendChart';
import { AdvicePanel } from './AdvicePanel';
import { PixelProgress } from './PixelProgress';
import { PanelFrame } from './PanelFrame';
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
    tone === 'accent' ? 'text-chill-accent' : tone === 'emerald' ? 'text-chill-sage' : tone === 'red' ? 'text-chill-red' : 'text-chill-text';
  return (
    <div className="rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow relative overflow-hidden">
      {/* Hard top-left bevel (pixel meter register): a chunky light edge - no soft gradient. */}
      <PanelFrame />
      <div className="relative flex items-start gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-none border flex items-center justify-center ${
          tone === 'red' ? 'text-chill-red border-chill-red/40 bg-chill-red/10'
          : tone === 'emerald' ? 'text-chill-sage border-chill-sage/40 bg-chill-sage/10'
          : 'text-chill-accent border-chill-accent/40 bg-chill-accent/10'
        }`}>
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
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3 w-3 text-chill-accent shrink-0">
        <rect x="7" y="2" width="2" height="2" fill="currentColor" />
        <rect x="5" y="5" width="6" height="6" fill="currentColor" />
        <rect x="7" y="10" width="2" height="2" fill="currentColor" />
      </svg>
      <div className="h-px flex-1 bg-chill-border" />
    </div>
  );
}

/** The Pengeluaran page: month picker, summary cards, per-category totals, transactions. */
export function ExpensesView({ apiKey }: ExpensesViewProps) {
  const { month, setMonth, summary, items, total, loading, error, reload } = useExpenses(apiKey);
  const trend = useExpenseTrend(apiKey);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  async function handleExport(format: 'csv' | 'pdf') {
    if (!apiKey) {
      setExportError(`API key diperlukan untuk ekspor ${format.toUpperCase()}.`);
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const blob =
        format === 'pdf'
          ? await exportExpensesPdf(month, { apiKey })
          : await exportExpensesCsv(month, { apiKey });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expenses-${month}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? `Gagal ekspor (${err.status}).` : 'Gagal ekspor.');
    } finally {
      setExporting(false);
    }
  }

  async function handleSave(payload: ExpenseWritePayload) {
    if (!apiKey) {
      setFormError('API key diperlukan untuk menyimpan pengeluaran.');
      return;
    }
    if (payload.nominal <= 0) {
      setFormError('Nominal harus lebih dari 0.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingItem) {
        await updateExpense(editingItem.id, payload, { apiKey });
      } else {
        await createExpense(payload, { apiKey });
      }
      setShowForm(false);
      setEditingItem(null);
      // Refresh the 6-month trend chart too — it is independent of the viewed
      // month, so without this it stays stale until the user hits Segarkan.
      trend.reload();
      // If the saved row falls in a different month than the viewed one, jump
      // the month picker so the result is visible — a row that saves in a
      // month you are not looking at otherwise looks silently lost.
      const savedMonth = payload.tanggal.slice(0, 7);
      if (savedMonth !== month) {
        setMonth(savedMonth);
      } else {
        reload();
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? `Gagal menyimpan (${err.status}).` : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!apiKey) {
      setDeleteError('API key diperlukan untuk menghapus pengeluaran.');
      return;
    }
    setSaving(true);
    setDeleteError(null);
    try {
      await deleteExpense(id, { apiKey });
      reload();
      trend.reload();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? `Gagal menghapus (${err.status}).` : 'Gagal menghapus.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: ExpenseItem) {
    setEditingItem(item);
    setShowForm(true);
    setFormError(null);
  }

  const hasData = (summary !== null && summary.total > 0) || items.length > 0;
  // This month's savings deposits (kategori "Nabung") vs the month's target —
  // shown as a progress meter so the savings goal is visible at a glance
  // alongside the budget cards (the backend already excludes Nabung from spend).
  const savingsThisMonth = summary?.perKategori?.['Nabung'] ?? 0;
  const savingsTarget = summary?.targetNabung ?? null;
  const savingsPercent =
    savingsTarget !== null && savingsTarget > 0
      ? Math.min(100, Math.round((savingsThisMonth / savingsTarget) * 100))
      : 0;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (categoryFilter && item.kategori !== categoryFilter) return false;
    if (!normalizedQuery) return true;
    return (
      item.keterangan.toLowerCase().includes(normalizedQuery) ||
      item.kategori.toLowerCase().includes(normalizedQuery) ||
      item.tanggal.includes(normalizedQuery) ||
      (item.waktu ?? '').toLowerCase().includes(normalizedQuery)
    );
  });
  const clearFilters = () => {
    setQuery('');
    setCategoryFilter('');
  };
  const showSummary = summary !== null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overscroll-y-contain text-chill-text">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-chill-border flex items-center justify-between gap-3 flex-wrap relative overflow-hidden">
        <div className="relative flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-chill-text pixel-heading">Pengeluaran</h2>
          {/* Pixel2 easter egg: Dave the Diver deep-sea bubble (decorative, aria-hidden). */}
          <span title="Pixel2 chill vibes — Dave the Diver & Stardew accents" className="inline-flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-deepsea">
              <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.5 8.5h.1M6.5 12h.1" />
            </svg>
          </span>
        </div>
        <label className="relative flex items-center gap-2 text-xs text-chill-muted">
          Bulan
          <input
            type="month"
            aria-label="Bulan pengeluaran"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="bg-chill-surface border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <button
          type="button"
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="relative shrink-0 rounded-none border border-chill-border bg-chill-surface px-4 py-2 text-sm font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? 'Menyiapkan…' : 'Ekspor CSV'}
        </button>
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          className="relative shrink-0 rounded-none border border-chill-border bg-chill-surface px-4 py-2 text-sm font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? 'Menyiapkan…' : 'Ekspor PDF'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingItem(null);
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="relative shrink-0 rounded-none bg-chill-accent text-chill-on-accent px-4 py-2 text-sm font-semibold transition hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 min-h-[44px]"
        >
          {showForm && !editingItem ? 'Batal' : 'Tambah'}
        </button>
      </header>

      <div className="flex-1 px-4 py-4 space-y-5">
        {exportError && (
          <div role="alert" className="rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red">
            {exportError}
          </div>
        )}
        {deleteError && (
          <div role="alert" className="rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red">
            {deleteError}
          </div>
        )}
        {showForm && (
          <ExpenseForm
            initial={editingItem}
            saving={saving}
            error={formError}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
              setFormError(null);
            }}
          />
        )}
        {error && (
          <div
            role="alert"
            className="rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={reload}
              className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 active:bg-chill-red/20 active:translate-y-[2px] active:shadow-none pixel-shadow-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
            >
              Coba lagi
            </button>
          </div>
        )}

        {loading && !showSummary && !error && (
          <p className="flex items-center justify-center gap-2 text-sm text-chill-muted py-10" role="status">
            <span className="w-2.5 h-2.5 bg-chill-accent rounded-none pixel-blink" aria-hidden="true" />
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
              <PixelProgress
                percent={(summary!.total / summary!.anggaran!) * 100}
                tone={summary!.total > summary!.anggaran! ? 'red' : 'accent'}
              />
            )}

            {summary!.catatan ? (
              <p className="text-xs text-chill-muted">{summary!.catatan}</p>
            ) : null}

            {savingsTarget !== null && savingsTarget > 0 && (
              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2.5 pixel-shadow-sm">
                {/* Shared hard 2px top-edge bevel (panel frame register) — chunky light
                    edge, no soft gradient; mirrors StatCard/AdvicePanel frames. */}
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-chill-text">Tabungan bulan ini</span>
                  <span className="tabular-nums text-chill-muted">
                    {formatRupiah(savingsThisMonth)} dari {formatRupiah(savingsTarget)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <PixelProgress percent={savingsPercent} />
                </div>
              </div>
            )}

            <AdvicePanel apiKey={apiKey} month={month} />

            <section aria-label="Tren pengeluaran bulanan" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow">
              <PanelFrame />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Tren Bulanan (6 bulan)</h3>
                <button
                  type="button"
                  onClick={trend.reload}
                  disabled={trend.loading}
                  className="shrink-0 rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50"
                >
                  {trend.loading ? 'Memuat…' : 'Segarkan'}
                </button>
              </div>
              {trend.error ? (
                <p role="alert" className="text-sm text-chill-red">{trend.error}</p>
              ) : trend.loading && trend.points.length === 0 ? (
                <p className="text-sm text-chill-muted" role="status">Memuat tren…</p>
              ) : (
                <ExpenseTrendChart points={trend.points} />
              )}
            </section>

            <section aria-label="Pengeluaran per hari" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow">
              <PanelFrame />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Pengeluaran per Hari</h3>
              </div>
              <DailySpendChart items={items} month={month} anggaran={summary!.anggaran} />
            </section>

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
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">
                  Transaksi ({total})
                </h3>
                {(query || categoryFilter) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="shrink-0 rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
                  >
                    Reset filter
                  </button>
                )}
              </div>

              {items.length > 0 && (
                <div className="mb-3 flex flex-col sm:flex-row gap-2">
                  <label className="flex-1 min-w-0 relative">
                    <span className="sr-only">Cari transaksi</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari transaksi…"
                      className="w-full bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm"
                    />
                  </label>
                  <label className="sm:w-52 relative">
                    <span className="sr-only">Filter kategori</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full appearance-none pr-9 cursor-pointer bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm"
                    >
                      <option value="">Semua kategori</option>
                      {CATEGORY_ORDER.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </label>
                </div>
              )}

              {items.length === 0 ? (
                <p className="text-sm text-chill-muted">Belum ada transaksi.</p>
              ) : filteredItems.length === 0 ? (
                <div className="rounded-none border border-chill-border bg-chill-surface px-4 py-3 text-sm text-chill-muted">
                  Tidak ada transaksi yang cocok dengan filter.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredItems.map((item) => (
                    <TransactionRow
                      key={item.id}
                      item={item}
                      onEdit={() => startEdit(item)}
                      onDelete={() => handleDelete(item.id)}
                      busy={saving}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {!loading && !error && !hasData && !showSummary && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 text-center py-12">
            {/* Decorative pixel-art ledger + coin ornament (chill palette, hard-edged). */}
            <svg width="52" height="36" viewBox="0 0 52 36" fill="none" aria-hidden="true" className="text-chill-muted shrink-0">
              <rect x="4" y="4" width="44" height="28" stroke="currentColor" strokeWidth="2" />
              <rect x="10" y="11" width="20" height="2" fill="currentColor" opacity="0.45" />
              <rect x="10" y="17" width="26" height="2" fill="currentColor" opacity="0.3" />
              <rect x="10" y="23" width="16" height="2" fill="currentColor" opacity="0.45" />
              <rect x="38" y="15" width="8" height="8" fill="currentColor" className="text-chill-accent" />
              <rect x="40" y="17" width="4" height="4" fill="currentColor" className="text-chill-on-accent" />
            </svg>
            {/* Subtle easter egg — a stacked gold coin (Stardew) & a deep-sea fish
                (Dave the Diver). Purely decorative — aria-hidden, rect-only, never
                interactive, so it cannot affect usability or the a11y tree. */}
            <div className="group relative flex flex-col items-center" aria-hidden="true">
              <div className="flex items-center gap-3">
                <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true" className="text-chill-accent shrink-0">
                  <rect x="4" y="4" width="12" height="12" fill="currentColor" />
                  <rect x="6" y="6" width="8" height="8" fill="currentColor" className="text-chill-on-accent" />
                  <rect x="6" y="16" width="8" height="2" fill="currentColor" />
                  <rect x="8" y="18" width="4" height="2" fill="currentColor" opacity="0.55" />
                </svg>
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true" className="text-chill-deepsea shrink-0">
                  <rect x="1" y="5" width="4" height="2" fill="currentColor" />
                  <rect x="1" y="8" width="4" height="2" fill="currentColor" opacity="0.65" />
                  <rect x="5" y="3" width="7" height="6" fill="currentColor" />
                  <rect x="12" y="3" width="5" height="6" fill="currentColor" opacity="0.85" />
                  <rect x="17" y="4" width="5" height="4" fill="currentColor" />
                  <rect x="5" y="6" width="7" height="3" fill="currentColor" opacity="0.45" />
                </svg>
              </div>
              <span className="mt-1.5 text-xs text-chill-muted opacity-0 pixel-step-fade group-hover:opacity-100 group-focus-within:opacity-100 select-none">
                Keep saving — the harvest is coming 🪙🐟
              </span>
            </div>
            <p className="text-sm text-chill-muted">Belum ada data pengeluaran bulan ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Segmented pixel comparison bar for a category's share of the month max
    (same register as PixelProgress: discrete blocks, zero radius, hard gaps). */
function CategoryBar({ ratio, className = '' }: { ratio: number; className?: string }) {
  const SEGMENTS = 12;
  const filled = Math.max(1, Math.round(ratio * SEGMENTS));
  return (
    <div
      aria-hidden="true"
      className={`flex h-2.5 items-stretch gap-[3px] rounded-none border border-chill-border bg-chill-surface px-[2px] ${className}`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <div key={i} className={`relative h-full flex-1 overflow-hidden ${i < filled ? 'bg-chill-accent' : 'bg-chill-border/30'}`}>
          {i < filled && <div className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />}
        </div>
      ))}
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
          <CategoryBar ratio={amount / max} className="flex-1" />
          <span className="w-28 text-right text-sm tabular-nums text-chill-text">{formatRupiah(amount)}</span>
        </li>
      ))}
    </ul>
  );
}

interface TransactionRowProps {
  item: ExpenseItem;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}

function TransactionRow({ item, onEdit, onDelete, busy }: TransactionRowProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  return (
    <li className="flex items-center gap-2 rounded-none bg-chill-surface border border-chill-border px-3 py-2.5 pixel-shadow-sm">
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
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Edit ${item.keterangan || item.kategori}`}
          className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-accent hover:border-chill-accent/50 active:bg-chill-elevated active:translate-y-[1px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4">
            <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 7.5l4 4" />
          </svg>
        </button>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label={`Hapus ${item.keterangan || item.kategori}`}
            className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-red hover:border-chill-red/50 active:bg-chill-red/10 active:translate-y-[1px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
            </svg>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Yakin hapus ${item.keterangan || item.kategori}`}
              className="rounded-none border border-chill-red/70 bg-chill-red/20 w-11 h-11 inline-flex items-center justify-center text-chill-red text-xs font-semibold transition hover:bg-chill-red/30 active:bg-chill-red/40 active:translate-y-[1px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 disabled:opacity-50"
            >
              Yakin?
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              aria-label="Batal hapus"
              className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-text hover:border-chill-accent/50 active:bg-chill-elevated active:translate-y-[1px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </>
        )}
      </div>
    </li>
  );
}


interface ExpenseFormProps {
  initial: ExpenseItem | null;
  saving: boolean;
  error: string | null;
  onSave: (payload: ExpenseWritePayload) => void;
  onCancel: () => void;
}

/** Small inline form to add or edit one expense row (P1-4 / P1-5). */
/** Today's date in WIB as YYYY-MM-DD (default date for new expense entries). */
function wibToday(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function ExpenseForm({ initial, saving, error, onSave, onCancel }: ExpenseFormProps) {
  const [tanggal, setTanggal] = useState(initial?.tanggal ?? wibToday());
  const [waktu, setWaktu] = useState(initial?.waktu ?? '');
  const [kategori, setKategori] = useState(initial?.kategori ?? 'Makan');
  const [keterangan, setKeterangan] = useState(initial?.keterangan ?? '');
  const [nominal, setNominal] = useState(initial ? String(initial.nominal) : '');
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    const digits = nominal.replace(/\D/g, '');
    const amount = digits ? Number(digits) : NaN;
    if (!tanggal) {
      setLocalError('Tanggal wajib diisi.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setLocalError('Nominal harus angka lebih dari 0.');
      return;
    }
    setLocalError(null);
    onSave({
      tanggal,
      waktu: waktu || undefined,
      kategori,
      keterangan: keterangan.trim(),
      nominal: amount,
    });
  }

  return (
    <section
      aria-label={initial ? 'Edit pengeluaran' : 'Tambah pengeluaran'}
      className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-accent/40 p-4 pixel-shadow-sm space-y-3"
    >
      <PanelFrame />
      <h3 className="text-sm font-semibold text-chill-text pixel-heading">
        {initial ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Tanggal
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="relative flex flex-col gap-1 text-xs text-chill-muted">
          Kategori
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            className="appearance-none pr-9 cursor-pointer bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Nominal (Rp)
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={nominal}
            onChange={(e) => setNominal(e.target.value)}
            placeholder="20000"
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Waktu (HH:MM, opsional)
          <input
            type="time"
            value={waktu}
            onChange={(e) => setWaktu(e.target.value)}
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-chill-muted">
        Keterangan
        <input
          type="text"
          maxLength={500}
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Mis. Makan warteg"
          className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
        />
      </label>
      {(localError || error) && (
        <p role="alert" className="text-sm text-chill-red">
          {localError ?? error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-none bg-chill-accent px-4 py-2 text-sm font-semibold text-chill-on-accent transition hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 min-h-[44px] disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : initial ? 'Simpan Perubahan' : 'Simpan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-none border border-chill-border px-4 py-2 text-sm font-medium text-chill-muted transition hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50"
        >
          Batal
        </button>
      </div>
    </section>
  );
}
