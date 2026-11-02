import { useState, type ReactNode } from 'react';
import { formatRupiah, getExpenseAdvice } from '../expensesApi';
import type { ExpenseAdvice } from '../expensesApi';
import { ApiError } from '../api';
import { PixelProgress } from './PixelProgress';
import { PanelFrame } from './PanelFrame';

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

/** Hard top-edge bevel strip (pixel meter register) for status callouts — matches
    the StatCard/frame surface grammar: a chunky 2px light edge, no soft gradient. */
function StatusCalloutTopEdge({ className }: { className: string }) {
  return <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${className}`} />;
}

/** Shared hard-edge bevel meter for a status callout (Oke / Over budget / no
    target). Centralises the pixel meter register: a chunky 2px light top-edge
    strip over a flat, square, warm-filled box — no soft gradient, no radius. */
function StatusCallout({
  tone,
  icon,
  children,
}: {
  tone: 'neutral' | 'accent' | 'red';
  icon: ReactNode;
  children: ReactNode;
}) {
  const box =
    tone === 'red'
      ? 'border-chill-red/40 bg-chill-red/10'
      : tone === 'accent'
        ? 'border-chill-accent/40 bg-chill-accent/10'
        : 'border-chill-border bg-chill-surface';
  const edge =
    tone === 'red' ? 'bg-chill-red/40' : tone === 'accent' ? 'bg-chill-accent/50' : 'bg-chill-elevated';
  const weight = tone === 'neutral' ? '' : 'font-medium';
  return (
    <div className={`relative rounded-none border px-3 py-2.5 ${box}`}>
      <StatusCalloutTopEdge className={edge} />
      <p className={`text-sm flex items-start gap-2 ${weight}`}>
        {icon}
        <span>{children}</span>
      </p>
    </div>
  );
}

/** One labelled daily-suggestion sub-block (menu meal, activity, fact, or tip). */
function DailyTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface px-3 py-2">
      {/* Shared hard-edge bevel (panel frame register): a chunky 2px light top
          edge ties each suggestion block into the same chiseled frame grammar. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
      <p className="relative text-xs font-medium uppercase tracking-wide text-chill-deepsea">{label}</p>
      <p className="relative mt-0.5 text-sm text-chill-text">{children}</p>
    </div>
  );
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
    <section aria-label="Analisa dan Saran" className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-border p-4 pixel-shadow">
      <PanelFrame />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading min-w-0">Analisa &amp; Saran</h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="advice-body"
          disabled={loading}
          className="shrink-0 rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3.5 py-2 text-sm font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/25 active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] min-w-[148px] justify-center disabled:opacity-50"
        >
          {loading && <span className="w-2.5 h-2.5 bg-chill-accent rounded-none pixel-blink mr-2 inline-block" aria-hidden="true" />}
          {loading ? 'Menganalisa…' : open ? 'Tutup' : 'Analisa & Saran'}
        </button>
      </div>

      {open && (
        <div id="advice-body" className="mt-4 space-y-4 pixel-reveal">
          {error && (
            <p role="alert" className="rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2 text-sm text-chill-red">
              {error}
            </p>
          )}

          {loading && !advice && !error && (
            <p role="status" className="text-sm text-chill-muted inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-chill-accent rounded-none pixel-blink" aria-hidden="true" />
              Menganalisa pengeluaran…
            </p>
          )}

          {advice && !error && (
            <>
              {advice.status === 'no_target' ? (
                <StatusCallout tone="neutral" icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-chill-deepsea">
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                }>
                  Belum ada target anggaran bulan ini. Total pengeluaran {formatRupiah(advice.dayTotal)} pada {advice.date}.
                </StatusCallout>
              ) : advice.status === 'over_budget' ? (
                <StatusCallout tone="red" icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5">
                    <path d="M12 4l9 16H3L12 4ZM12 10v4M12 17h.01" />
                  </svg>
                }>
                  Over budget: {formatRupiah(advice.dayTotal)} &gt; anggaran harian {formatRupiah(advice.dailyBudget)} (lebih {formatRupiah(advice.overBy)})
                </StatusCallout>
              ) : (
                <StatusCallout tone="accent" icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                }>
                  Oke: {formatRupiah(advice.dayTotal)} ≤ anggaran harian {formatRupiah(advice.dailyBudget)}
                </StatusCallout>
              )}

              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-elevated p-3 space-y-2">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-border" />
                <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Saran Harian · {advice.date}</h4>
                <DailyTip label="Sarapan">{advice.daily.sarapan}</DailyTip>
                <DailyTip label="Makan siang">{advice.daily.makanSiang}</DailyTip>
                <DailyTip label="Makan malam">{advice.daily.makanMalam}</DailyTip>
                <DailyTip label="Aktivitas">{advice.daily.aktivitas}</DailyTip>
                <DailyTip label="Tahukah kamu?">{advice.daily.funFact}</DailyTip>
                <DailyTip label="Tips anak kos">{advice.daily.tipAnakKos}</DailyTip>
              </div>

              {advice.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide mb-2 pixel-heading">Saran</h4>
                  <ul className="space-y-1.5">
                    {advice.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-chill-text">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-chill-accent">
                          <path d="M7 7h10v10H7z" />
                        </svg>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {advice.categoryTrend.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    {/* Easter egg: deep-sea bubble (Dave the Diver) — decorative, decorative-hidden */}
                    <span title="Dave the Diver: dive the monthly trend 🐠" className="inline-flex">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-deepsea">
                        <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.5 8.5h.1M6.5 12h.1" />
                      </svg>
                    </span>
                    <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Pola pengeluaran bulan ini</h4>
                  </div>
                  {(() => {
                    const trendMax = Math.max(1, ...advice.categoryTrend.map((c) => c.total));
                    return (
                      <ul className="space-y-1.5">
                        {advice.categoryTrend.slice(0, 4).map((c) => (
                          <li key={c.kategori} className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-chill-text">{c.kategori}</span>
                              <span className="tabular-nums text-chill-muted">{formatRupiah(c.total)}</span>
                            </div>
                            <div className="mt-1">
                              <PixelProgress percent={(c.total / trendMax) * 100} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  <p className="mt-2 text-sm text-chill-muted tabular-nums">
                    Jika pola ini berlanjut, akhir bulan ± {formatRupiah(advice.projection.projectedTotal)} · anggaran {formatRupiah(advice.projection.anggaran)}
                    {advice.projection.projectedOver > 0
                      ? ` (lebih ${formatRupiah(advice.projection.projectedOver)})`
                      : ' · aman'}
                  </p>
                </div>
              )}

              <div className="border-t border-chill-border pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                    {/* Easter egg: sage sprout (Stardew Valley) — decorative, aria-hidden */}
                    <span title="Stardew Valley: keep harvesting your savings 🌱" className="inline-flex">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-sage">
                        <path d="M12 21V10M12 10l4-4M12 10l-4-4M12 15l-3-3M12 15l3-3" />
                      </svg>
                    </span>
                    <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Goal: Part PC</h4>
                  </div>
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
                <PixelProgress percent={advice.pcGoal.percentCollected} />
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
