import { useEffect, useRef, useState } from 'react';
import {
  formatRupiah,
  exportExpensesCsv,
  exportExpensesPdf,
  createExpense,
  updateExpense,
  deleteExpense,
  updateExpenseTarget,
  type ExpenseWritePayload,
} from '../expensesApi';
import { ApiError } from '../api';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseTrend } from '../hooks/useExpenseTrend';
import { remainingDailyBudget } from '../expenseBudget';
import { ExpenseTrendChart } from './ExpenseTrendChart';
import { DailySpendChart } from './DailySpendChart';
import { WeeklySpendBreakdown } from './WeeklySpendBreakdown';
import { AdvicePanel } from './AdvicePanel';
import { PixelProgress } from './PixelProgress';
import { PanelFrame } from './PanelFrame';
import { ScanLoader } from './ScanLoader';
import { CategoryIcon } from './categoryIcons';
import { findDuplicateExpense } from '../expenseDup';
import type { ExpenseItem } from '../expensesApi';

/** Props accepted by {@link ExpensesView}. */
export interface ExpensesViewProps {
  /** Backend API key; sent as `X-Api-Key` on every expenses request. */
  apiKey?: string;
}

const CATEGORY_ORDER = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Nabung', 'Lain'];

function KategoriBadge({ kategori }: { kategori: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 rounded-none bg-chill-surface border border-chill-border px-2 py-0.5 text-xs text-chill-muted">
      <CategoryIcon kategori={kategori} className="w-3.5 h-3.5" />
      {kategori}
    </span>
  );
}

/** Pixel table glyph for the CSV export action (square strokes, chill register). */
function CsvIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
      <path d="M4 5h16v14H4V5ZM4 10h16M4 15h16M10 5v5M15 10v5" />
    </svg>
  );
}

/** Pixel document glyph for the PDF export action. */
function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
      <path d="M7 3h7l4 4v14H7V3ZM14 3v4h4M9.5 12h5M9.5 15h5M9.5 18h3" />
    </svg>
  );
}

/** Pixel plus-or-close glyph for the Tambah ↔ Batal toggle. */
function AddCloseIcon({ close }: { close: boolean }) {
  return close ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Pixel refresh glyph for reload actions (Segarkan / Coba lagi). */
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
      <path d="M20 12a8 8 0 1 1-3-6.27M20 5v4h-4" />
    </svg>
  );
}


function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: string; icon: string; tone?: 'default' | 'accent' | 'emerald' | 'red' }) {
  const valueClass =
    tone === 'accent' ? 'text-chill-accent' : tone === 'emerald' ? 'text-chill-sage' : tone === 'red' ? 'text-chill-red' : 'text-chill-text';
  return (
    <div className="rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow relative overflow-hidden pixel-reveal">
      {/* Hard top-left bevel (pixel meter register): a chunky light edge - no soft gradient. */}
      <PanelFrame />
      <div className="relative flex items-start gap-3">
        <div className={`relative shrink-0 w-9 h-9 rounded-none border flex items-center justify-center ${
          tone === 'red' ? 'text-chill-red border-chill-red/40 bg-chill-red/10'
          : tone === 'emerald' ? 'text-chill-sage border-chill-sage/40 bg-chill-sage/10'
          : 'text-chill-accent border-chill-accent/40 bg-chill-accent/10'
        }`}>
          <CategoryIcon kategori={icon} className="w-5 h-5" />
          <span aria-hidden="true" className="absolute right-0 bottom-0 h-1 w-1 bg-black/25" />
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
      <div className="h-[2px] flex-1 bg-chill-border" />
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3 w-3 text-chill-accent shrink-0">
        <rect x="7" y="2" width="2" height="2" fill="currentColor" />
        <rect x="5" y="5" width="6" height="6" fill="currentColor" />
        <rect x="7" y="10" width="2" height="2" fill="currentColor" />
      </svg>
      <div className="h-[2px] flex-1 bg-chill-border" />
    </div>
  );
}

/** The Pengeluaran page: month picker, summary cards, per-category totals, transactions. */
export function ExpensesView({ apiKey }: ExpensesViewProps) {
  const { month, setMonth, summary, sisa, items, total, loading, error, reload } = useExpenses(apiKey);
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
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<{ payload: ExpenseWritePayload; match: ExpenseItem } | null>(null);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetAnggaran, setTargetAnggaran] = useState('');
  const [targetNabung, setTargetNabung] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // When the edit form opens (mobile), scroll it into view so the save/cancel
  // buttons are visible without requiring the user to scroll back up.
  useEffect(() => {
    if (showForm && editingItem) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm, editingItem]);

  // Transient success confirmation (retro feedback principle): confirm the
  // action where the person is looking, then auto-clear. Hard-edged pixel
  // register — role="status" live region, stepped reveal, reduced-motion-safe.
  useEffect(() => {
    if (!savedNote) return;
    const t = window.setTimeout(() => setSavedNote(null), 3500);
    return () => window.clearTimeout(t);
  }, [savedNote]);

  async function handleExport(format: 'csv' | 'pdf') {
    if (!apiKey) {
      setExportError(`API key diperlukan untuk ekspor ${format.toUpperCase()}.`);
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      // Honor the active list filters so exporting yields exactly the rows on screen.
      const filter = { kategori: categoryFilter || undefined, q: query.trim() || undefined };
      const blob =
        format === 'pdf'
          ? await exportExpensesPdf(month, { apiKey }, filter)
          : await exportExpensesCsv(month, { apiKey }, filter);
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
    // Guard against accidental double-entry: if the payload exactly matches an
    // existing row (same date, kategori, nominal and keterangan), pause for an
    // explicit confirmation instead of silently inserting a duplicate that would
    // skew every aggregate (totals, projection, advice). The edited row itself is
    // excluded so editing without changing the values is never flagged. Only rows
    // in the currently-loaded month are visible here, which is the realistic
    // double-entry window.
    const dup = findDuplicateExpense(payload, items, editingItem?.id);
    if (dup) {
      setDupWarning({ payload, match: dup });
      return;
    }
    setFormError(null);
    await performSave(payload);
  }

  async function performSave(payload: ExpenseWritePayload) {
    const note = editingItem ? 'Perubahan tersimpan.' : 'Pengeluaran tersimpan.';
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
      setSavedNote(note);
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
      setSavedNote('Pengeluaran dihapus.');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? `Gagal menghapus (${err.status}).` : 'Gagal menghapus.');
    } finally {
      setSaving(false);
    }
  }

  function openTargetForm() {
    setTargetAnggaran(summary?.anggaran != null ? String(summary.anggaran) : '');
    setTargetNabung(summary?.targetNabung != null ? String(summary.targetNabung) : '');
    setTargetError(null);
    setShowTargetForm(true);
  }

  async function handleSaveTarget() {
    if (!apiKey) {
      setTargetError('API key diperlukan untuk mengatur anggaran.');
      return;
    }
    const anggaran = Number(targetAnggaran);
    const nabung = Number(targetNabung);
    if (!Number.isInteger(anggaran) || anggaran < 0) {
      setTargetError('Anggaran harus bilangan bulat ≥ 0.');
      return;
    }
    if (!Number.isInteger(nabung) || nabung < 0) {
      setTargetError('Target nabung harus bilangan bulat ≥ 0.');
      return;
    }
    setTargetSaving(true);
    setTargetError(null);
    try {
      await updateExpenseTarget({ month, anggaran, targetNabung: nabung }, { apiKey });
      setShowTargetForm(false);
      setSavedNote('Anggaran & target nabung tersimpan.');
      reload();
    } catch (err) {
      setTargetError(err instanceof ApiError ? `Gagal menyimpan anggaran (${err.status}).` : 'Gagal menyimpan anggaran.');
    } finally {
      setTargetSaving(false);
    }
  }

  function startEdit(item: ExpenseItem) {
    setEditingItem(item);
    setShowForm(true);
    setFormError(null);
    setDupWarning(null);
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
  // Forward-looking budget projection: what can still be spent per day for the
  // rest of the live month (only meaningful when viewing the current month).
  const remBudget =
    summary?.anggaran != null && summary.anggaran > 0
      ? remainingDailyBudget(month, summary.sisaAnggaran ?? 0)
      : null;

  // Today's discretionary spend (non-Nabung, non-Tagihan) vs today's budget — the
  // actionable daily figure that previously required expanding Analisa & Saran.
  // Same exclusion semantics as the day-total used by the advice/daily/weekly views;
  // only meaningful for the live month (where remBudget is non-null).
  const todayKey = wibToday();
  const todaySpend = items
    .filter((it) => it.tanggal === todayKey && it.kategori !== 'Nabung' && it.kategori !== 'Tagihan')
    .reduce((sum, it) => sum + it.nominal, 0);
  const todayEffDays = summary?.hari && summary.hari > 0 ? summary.hari : daysInMonthKey(month);
  const todayBudget =
    summary?.anggaran != null && summary.anggaran > 0
      ? Math.max(1, Math.round(summary.anggaran / todayEffDays))
      : null;
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
  const [allTime, setAllTime] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overscroll-y-contain text-chill-text pixel-grid-page pixel-reveal">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-chill-border flex items-center justify-between gap-3 flex-wrap relative overflow-hidden">
        <div className="relative flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-chill-text pixel-heading">Pengeluaran</h2>
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
        {(query || categoryFilter) && (
          <span
            title="CSV/PDF akan memuat transaksi sesuai filter aktif"
            className="text-xs text-chill-muted uppercase tracking-wide pixel-heading"
          >
            Ekspor ikut filter aktif
          </span>
        )}
        <button
          type="button"
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="relative shrink-0 rounded-none border border-chill-border bg-chill-surface px-4 py-2 text-sm font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center gap-1.5 justify-center"
        >
          
          <CsvIcon />
          {exporting ? 'Menyiapkan…' : 'Ekspor CSV'}
        </button>
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          className="relative shrink-0 rounded-none border border-chill-border bg-chill-surface px-4 py-2 text-sm font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center gap-1.5 justify-center"
        >
          
          <PdfIcon />
          {exporting ? 'Menyiapkan…' : 'Ekspor PDF'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingItem(null);
            setShowForm((v) => !v);
            setFormError(null);
            setDupWarning(null);
          }}
          className="relative shrink-0 rounded-none border border-chill-accent/60 bg-chill-accent text-chill-on-accent px-4 py-2 text-sm font-semibold transition hover:bg-chill-accent-hover active:bg-chill-accent-active hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 min-h-[44px] inline-flex items-center gap-1.5 justify-center"
        >
          
          <AddCloseIcon close={Boolean(showForm && !editingItem)} />
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
        {savedNote && (
          <div
            role="status"
            className="rounded-none border border-chill-sage/40 bg-chill-sage/10 px-4 py-3 text-sm text-chill-sage flex items-center gap-2 pixel-reveal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0">
              <path d="M4 12l5 5L20 6" />
            </svg>
            {savedNote}
          </div>
        )}
        {showForm && (
          <div ref={formRef}>
          {dupWarning && (
            <div role="alert" className="mb-3 rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm">
              <p className="font-medium text-chill-red">
                Entri serupa sudah ada: {formatRupiah(dupWarning.match.nominal)} · “{dupWarning.match.keterangan || dupWarning.match.kategori}”
              </p>
              <p className="mt-0.5 text-xs text-chill-muted tabular-nums">
                {dupWarning.match.tanggal} · {dupWarning.match.kategori} · {formatRupiah(dupWarning.match.nominal)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = dupWarning.payload;
                    setDupWarning(null);
                    void performSave(p);
                  }}
                  className="rounded-none border border-chill-red/70 bg-chill-red/20 px-3.5 py-2 text-sm font-semibold text-chill-red transition hover:bg-chill-red/30 active:bg-chill-red/40 hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 min-h-[44px]"
                >
                  Simpan tetap
                </button>
                <button
                  type="button"
                  onClick={() => setDupWarning(null)}
                  className="rounded-none border border-chill-border px-3.5 py-2 text-sm font-medium text-chill-muted transition hover:bg-chill-elevated active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
          <ExpenseForm
            initial={editingItem}
            saving={saving}
            error={formError}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
              setFormError(null);
              setDupWarning(null);
            }}
          />
          </div>
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
              className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 active:bg-chill-red/20 hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 inline-flex items-center gap-1.5"
            >
              <RefreshIcon />
              Coba lagi
            </button>
          </div>
        )}

        {loading && !showSummary && !error && (
          <p className="flex items-center justify-center gap-2 text-sm text-chill-muted py-10" role="status">
            <ScanLoader />
            Memuat data pengeluaran…
          </p>
        )}

        {showSummary && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-chill-muted">Sisa Uang</span>
              <div className="inline-flex rounded-none border border-chill-border overflow-hidden" role="group" aria-label="Rentang waktu sisa uang">
                <button
                  type="button"
                  onClick={() => setAllTime(false)}
                  aria-pressed={!allTime}
                  className={`px-3 py-1.5 text-xs font-medium transition min-h-[44px] rounded-none pixel-shadow-sm active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                    !allTime ? 'bg-chill-accent text-chill-bg' : 'bg-chill-surface text-chill-muted hover:bg-chill-elevated'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => setAllTime(true)}
                  aria-pressed={allTime}
                  className={`px-3 py-1.5 text-xs font-medium transition min-h-[44px] rounded-none pixel-shadow-sm active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                    allTime ? 'bg-chill-accent text-chill-bg' : 'bg-chill-surface text-chill-muted hover:bg-chill-elevated'
                  }`}
                >
                  Semua Waktu
                </button>
              </div>
            </div>

            {allTime ? (
              <section aria-label="Ringkasan semua waktu" className="pixel-reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Sisa Uang"
                  value={sisa ? formatRupiah(sisa.sisaUang) : '—'}
                  icon="Nabung"
                  tone={sisa && sisa.sisaUang < 0 ? 'red' : 'emerald'}
                />
                <StatCard label="Total Pemasukan" value={sisa ? formatRupiah(sisa.totalPemasukan) : '—'} icon="Tagihan" />
                <StatCard label="Total Pengeluaran" value={sisa ? formatRupiah(sisa.totalPengeluaran) : '—'} icon="Lain" tone="accent" />
                <StatCard label="Dari Gaji" value={sisa ? formatRupiah(sisa.totalPemasukan) : '—'} icon="Gaji" />
              </section>
            ) : (
              <section aria-label="Ringkasan bulanan" className="pixel-reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            )}

            {summary!.anggaran !== null && summary!.anggaran > 0 && (
              <PixelProgress
                percent={(summary!.total / summary!.anggaran!) * 100}
                tone={summary!.total > summary!.anggaran! ? 'red' : 'accent'}
              />
            )}

            {!allTime && (
              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2.5 pixel-shadow-sm">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
                <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-elevated" />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs font-medium uppercase tracking-wider text-chill-muted">Anggaran bulan ini</span>
                  <button
                    type="button"
                    onClick={() => (showTargetForm ? setShowTargetForm(false) : openTargetForm())}
                    aria-expanded={showTargetForm}
                    className="rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3.5 py-2 text-sm font-medium text-chill-accent transition min-h-[44px] hover:bg-chill-accent/20 active:bg-chill-accent/25 active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  >
                    {showTargetForm ? 'Batal' : 'Atur anggaran'}
                  </button>
                </div>
                {showTargetForm && (
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs text-chill-muted">
                      Anggaran
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={targetAnggaran}
                        onChange={(e) => setTargetAnggaran(e.target.value)}
                        placeholder="mis. 600000"
                        className="mt-1 w-full bg-chill-surface border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text tabular-nums pixel-shadow-sm [color-scheme:dark]"
                      />
                    </label>
                    <label className="block text-xs text-chill-muted">
                      Target Nabung
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={targetNabung}
                        onChange={(e) => setTargetNabung(e.target.value)}
                        placeholder="mis. 300000"
                        className="mt-1 w-full bg-chill-surface border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text tabular-nums pixel-shadow-sm [color-scheme:dark]"
                      />
                    </label>
                    {targetError && (
                      <p role="alert" className="rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2 text-sm text-chill-red">
                        {targetError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveTarget}
                      disabled={targetSaving}
                      className="rounded-none border border-chill-accent bg-chill-accent px-4 py-2 text-sm font-medium text-chill-bg transition min-h-[44px] hover:bg-chill-accent/90 active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50 disabled:shadow-none"
                    >
                      {targetSaving ? 'Menyimpan…' : 'Simpan'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {remBudget && (
              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2.5 pixel-shadow-sm">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
                <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-elevated" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-chill-text">Sisa per hari</span>
                  {remBudget.sisa >= 0 ? (
                    <span className="tabular-nums text-chill-muted">
                      ±{formatRupiah(remBudget.dailyAllowance)} · {remBudget.daysLeft} hari tersisa
                    </span>
                  ) : (
                    <span className="tabular-nums text-chill-red">
                      perlu hemat {formatRupiah(-remBudget.dailyAllowance)}/hari · {remBudget.daysLeft} hari
                    </span>
                  )}
                </div>
                {todayBudget !== null && (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-chill-text">Hari ini</span>
                      <span className="tabular-nums text-chill-muted">
                        {formatRupiah(todaySpend)} dari ±{formatRupiah(todayBudget)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <PixelProgress
                        percent={(todaySpend / Math.max(1, todayBudget)) * 100}
                        tone={todaySpend > todayBudget ? 'red' : 'accent'}
                      />
                    </div>
                  </>
                )}

              </div>
            )}

            {summary!.catatan ? (
              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2.5 pixel-shadow-sm">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
                <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-elevated" />
                <p className="text-xs text-chill-muted">{summary!.catatan}</p>
              </div>
            ) : null}

            {savingsTarget !== null && savingsTarget > 0 && (
              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2.5 pixel-shadow-sm">
                {/* Shared hard 2px top-edge bevel (panel frame register) — chunky light
                    edge, no soft gradient; mirrors StatCard/AdvicePanel frames. */}
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
                <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-elevated" />
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

            <section aria-label="Tren pengeluaran bulanan" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow pixel-reveal">
              <PanelFrame />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span title="Stardew Valley: watch your spending trend grow 🌱" className="inline-flex shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-sage">
                      <path d="M12 21V10M12 10l4-4M12 10l-4-4M12 15l-3-3M12 15l3-3" />
                    </svg>
                  </span>
                  <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Tren Bulanan (6 bulan)</h3>
                </span>
                <button
                  type="button"
                  onClick={trend.reload}
                  disabled={trend.loading}
                  className="shrink-0 rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-1.5 justify-center"
                >
                  
          <RefreshIcon />
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

            <section aria-label="Pengeluaran per hari" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow pixel-reveal">
              <PanelFrame />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span title="Dave the Diver: dive into today's depths 🐠" className="inline-flex shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-deepsea">
                      <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.5 8.5h.1M6.5 12h.1" />
                    </svg>
                  </span>
                  <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Pengeluaran per Hari</h3>
                </span>
              </div>
              <DailySpendChart items={items} month={month} anggaran={summary!.anggaran} hari={summary.hari ?? undefined} />
            </section>

            <section aria-label="Pengeluaran per minggu" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow pixel-reveal">
              <PanelFrame />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span title="Rangkuman mingguan (Senin–Sabtu) 🗓️" className="inline-flex shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-accent">
                      <path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
                    </svg>
                  </span>
                  <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Pengeluaran per Minggu</h3>
                </span>
              </div>
              <WeeklySpendBreakdown items={items} month={month} />
            </section>

            <HeaderDivider />

            <section aria-label="Total per kategori">
              <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-3 pixel-heading">Total per Kategori</h3>
              {Object.keys(summary!.perKategori).length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-chill-muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
                    <rect x="4" y="10" width="4" height="9" />
                    <rect x="10" y="6" width="4" height="13" />
                    <rect x="16" y="13" width="4" height="6" />
                  </svg>
                  <span>Belum ada pengeluaran tercatat di bulan ini.</span>
                </p>
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
                    className="shrink-0 rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:border-chill-accent/50 hover:text-chill-accent active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
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
                      className="w-full appearance-none pr-9 cursor-pointer bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text transition-colors pixel-shadow-sm [color-scheme:dark]"
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
                <p className="flex items-center gap-2 text-sm text-chill-muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
                    <rect x="4" y="5" width="16" height="14" />
                    <path d="M4 9h16M4 13h16M4 17h10" />
                  </svg>
                  <span>Belum ada transaksi.</span>
                </p>
              ) : filteredItems.length === 0 ? (
                <div className="rounded-none border border-chill-border bg-chill-surface px-4 py-3 text-sm text-chill-muted flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
                    <rect x="5" y="5" width="12" height="12" />
                    <path d="M15 15l4 4" />
                  </svg>
                  <span>Tidak ada transaksi yang cocok dengan filter.</span>
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
    <li className="flex items-center gap-2 rounded-none bg-chill-surface border border-chill-border px-3 py-2.5 pixel-shadow-sm transition hover:bg-chill-elevated">
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
          className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-accent hover:border-chill-accent/50 active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50 disabled:shadow-none"
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
            className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-red hover:border-chill-red/50 active:bg-chill-red/10 hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 disabled:opacity-50 disabled:shadow-none"
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
              className="rounded-none border border-chill-red/70 bg-chill-red/20 w-11 h-11 inline-flex items-center justify-center text-chill-red text-xs font-semibold transition hover:bg-chill-red/30 active:bg-chill-red/40 hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60 disabled:opacity-50 disabled:shadow-none"
            >
              Yakin?
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              aria-label="Batal hapus"
              className="rounded-none border border-chill-border w-11 h-11 inline-flex items-center justify-center text-chill-muted transition hover:text-chill-text hover:border-chill-accent/50 active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50 disabled:shadow-none"
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

/** Days in a YYYY-MM month key. */
function daysInMonthKey(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
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
            className="appearance-none pr-9 cursor-pointer bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text transition-colors pixel-shadow-sm [color-scheme:dark]"
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
          className="rounded-none border border-chill-accent/60 bg-chill-accent px-4 py-2 text-sm font-semibold text-chill-on-accent transition hover:bg-chill-accent-hover active:bg-chill-accent-active hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 min-h-[44px] disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Menyimpan…' : initial ? 'Simpan Perubahan' : 'Simpan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-none border border-chill-border px-4 py-2 text-sm font-medium text-chill-muted transition hover:bg-chill-elevated active:bg-chill-elevated hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:shadow-none"
        >
          Batal
        </button>
      </div>
    </section>
  );
}
