import { useState } from 'react';
import { formatRupiah, getExpenseAdvice } from '../expensesApi';
import type { ExpenseAdvice } from '../expensesApi';
import { ApiError } from '../api';

/** Props accepted by {@link AdvicePanel}. */
export interface AdvicePanelProps {
  /** Backend API key; sent as `X-Api-Key`. */
  apiKey?: string;
  /** Selected month key (YYYY-MM); used to pick the date to analyse. */
  month: string;
}

/** Picks the date to analyse: today when the month is current, else the month's last day. */
function analyseDate(month: string): string {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (month === currentMonth) {
    return `${month}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

/** The "Analisa & Saran" panel: daily budget check, tips, projection and PC goal. */
export function AdvicePanel({ apiKey, month }: AdvicePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<ExpenseAdvice | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    if (!apiKey) {
      setError('API key diperlukan untuk Analisa & Saran.');
      setAdvice(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getExpenseAdvice(analyseDate(month), { apiKey });
      setAdvice(data);
    } catch (err) {
      setError(err instanceof ApiError ? `Gagal memuat analisa (${err.status}).` : 'Gagal memuat analisa.');
      setAdvice(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Analisa dan Saran" className="rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Analisa &amp; Saran</h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          disabled={loading}
          className="shrink-0 rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3.5 py-2 text-sm font-medium text-chill-accent transition hover:bg-chill-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50"
        >
          {loading ? 'Menganalisa…' : open ? 'Tutup' : 'Analisa & Saran'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {error && (
            <p role="alert" className="rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2 text-sm text-chill-red">
              {error}
            </p>
          )}

          {loading && !advice && !error && (
            <p role="status" className="text-sm text-chill-muted">Menganalisa pengeluaran…</p>
          )}

          {advice && !error && (
            <>
              {advice.status === 'no_target' ? (
                <p className="text-sm text-chill-muted">
                  Belum ada target anggaran bulan ini. Total pengeluaran {formatRupiah(advice.dayTotal)} pada {advice.date}.
                </p>
              ) : advice.status === 'over_budget' ? (
                <div className="rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2.5">
                  <p className="text-sm font-medium text-chill-red">
                    ⚠️ Over budget: {formatRupiah(advice.dayTotal)} &gt; anggaran harian {formatRupiah(advice.dailyBudget)} (lebih {formatRupiah(advice.overBy)})
                  </p>
                </div>
              ) : (
                <div className="rounded-none border border-chill-accent/40 bg-chill-accent/10 px-3 py-2.5">
                  <p className="text-sm font-medium text-chill-accent">
                    ✓ Oke: {formatRupiah(advice.dayTotal)} ≤ anggaran harian {formatRupiah(advice.dailyBudget)}
                  </p>
                </div>
              )}

              {advice.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-2 pixel-heading">Saran</h4>
                  <ul className="space-y-1.5">
                    {advice.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-chill-text">
                        <span className="shrink-0 text-chill-accent" aria-hidden="true">▸</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {advice.categoryTrend.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-2 pixel-heading">Pola pengeluaran bulan ini</h4>
                  <ul className="space-y-1">
                    {advice.categoryTrend.slice(0, 4).map((c) => (
                      <li key={c.kategori} className="flex items-center justify-between text-sm">
                        <span className="text-chill-text">{c.kategori}</span>
                        <span className="tabular-nums text-chill-muted">{formatRupiah(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-chill-muted">
                    Jika pola ini berlanjut, akhir bulan ± {formatRupiah(advice.projection.projectedTotal)} · anggaran {formatRupiah(advice.projection.anggaran)}
                    {advice.projection.projectedOver > 0
                      ? ` (lebih ${formatRupiah(advice.projection.projectedOver)})`
                      : ' · aman'}
                  </p>
                </div>
              )}

              <div className="border-t border-chill-border pt-3">
                <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-2 pixel-heading">Goal: Part PC</h4>
                <ul className="space-y-1 mb-2">
                  {advice.pcGoal.parts.map((part) => (
                    <li key={part.name} className="flex items-center justify-between text-sm">
                      <span className="text-chill-text">{part.name}</span>
                      <span className="tabular-nums text-chill-muted">{formatRupiah(part.price)}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between text-sm font-medium border-t border-chill-border pt-1.5 mt-1.5">
                    <span className="text-chill-text">Total</span>
                    <span className="tabular-nums text-chill-accent">{formatRupiah(advice.pcGoal.totalNeeded)}</span>
                  </li>
                </ul>
                <div className="h-2 rounded-none bg-chill-surface border border-chill-border overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full bg-chill-accent"
                    style={{ width: `${Math.min(100, advice.pcGoal.percentCollected)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-chill-muted">
                  Terkumpul {formatRupiah(advice.pcGoal.nabungSoFar)} ({advice.pcGoal.percentCollected}%) · kurang {formatRupiah(advice.pcGoal.remaining)}
                </p>
                <p className="mt-1 text-sm text-chill-muted">
                  {advice.pcGoal.monthsToReach !== null
                    ? `Potensi nabung ± ${formatRupiah(advice.pcGoal.potentialSavingPerMonth)}/bulan → ± ${advice.pcGoal.monthsToReach} bulan lagi`
                    : 'Potensi nabung bulan ini belum positif — kurangi pengeluaran supaya target tercapai.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
