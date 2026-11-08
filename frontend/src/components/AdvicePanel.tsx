import { useState, type ReactNode } from 'react';
import { formatRupiah, getExpenseAdvice } from '../expensesApi';
import type { ExpenseAdvice } from '../expensesApi';
import { ApiError } from '../api';
import { analyseDate } from '../adviceDate';
import { PixelProgress } from './PixelProgress';
import { PanelFrame } from './PanelFrame';
import { CategoryIcon } from './categoryIcons';

/** Props accepted by {@link AdvicePanel}. */
export interface AdvicePanelProps {
  /** Backend API key; sent as `X-Api-Key`. */
  apiKey?: string;
  /** Selected month key (YYYY-MM); used to pick the date to analyse. */
  month: string;
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
      <div aria-hidden="true" className={`absolute inset-y-0 left-0 w-[2px] ${edge}`} />
      <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
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
      <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-elevated" />
      <p className="relative text-xs font-medium uppercase tracking-wide text-chill-accent">{label}</p>
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
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span title="Pixel2 chill vibes — Dave the Diver & Stardew accents" className="inline-flex shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-deepsea">
              <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.5 8.5h.1M6.5 12h.1" />
            </svg>
          </span>
          <h3 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Analisa &amp; Saran</h3>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="advice-body"
          disabled={loading}
          className="shrink-0 rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3.5 py-2 text-sm font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/25 hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] min-w-[148px] justify-center disabled:opacity-50 disabled:shadow-none"
        >
          {loading && <span className="w-2.5 h-2.5 bg-chill-accent rounded-none pixel-blink mr-2 inline-block" aria-hidden="true" />}
          {loading ? 'Menganalisa…' : open ? 'Tutup' : 'Analisa & Saran'}
          {!loading && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden="true"
              className={`ml-1.5 inline-block h-3.5 w-3.5 transition-transform duration-100 [transition-timing-function:steps(2,jump-none)] ${open ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
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

              {advice.remainingAllowance.anggaran > 0 && (
                <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-elevated p-3 pixel-shadow-sm">
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-border" />
                  <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-border" />
                  <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                  <div aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 bg-chill-accent/15" />
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Sisa anggaran</h4>
                    <span className={`text-sm font-semibold tabular-nums ${advice.remainingAllowance.remainingBudget > 0 ? 'text-chill-accent' : 'text-chill-red'}`}>
                      {formatRupiah(advice.remainingAllowance.remainingBudget)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-chill-muted tabular-nums">
                    Terpakai {formatRupiah(advice.remainingAllowance.spentSoFar)} dari {formatRupiah(advice.remainingAllowance.anggaran)}
                  </p>
                  <p className={`mt-1.5 text-sm tabular-nums ${advice.remainingAllowance.perDayAllowance > 0 ? 'text-chill-text' : 'text-chill-red font-medium'}`}>
                    {advice.remainingAllowance.perDayAllowance > 0 ? (
                      <>
                        ±{formatRupiah(advice.remainingAllowance.perDayAllowance)}/hari{' '}
                        {advice.remainingAllowance.daysLeft === 1
                          ? 'di sisa hari terakhir bulan ini'
                          : `untuk ${advice.remainingAllowance.daysLeft} hari ke depan`}
                      </>
                    ) : (
                      <>Anggaran sudah terlampaui — fokus kurangi pengeluaran hari ini.</>
                    )}
                  </p>
                  <div className="mt-2">
                    <PixelProgress
                      percent={(advice.remainingAllowance.spentSoFar / Math.max(1, advice.remainingAllowance.anggaran)) * 100}
                      tone={advice.remainingAllowance.remainingBudget > 0 ? 'accent' : 'red'}
                    />
                  </div>
                </div>
              )}

              <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-elevated p-3 space-y-2 pixel-shadow-sm">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-border" />
                <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                <div aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 bg-chill-accent/15" />
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-border" />
                <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Saran Harian · {advice.date}</h4>
                {advice.daily.biaya && (
                  <p className="text-xs text-chill-muted tabular-nums">
                    Estimasi biaya menu hari ini: <span className="font-medium text-chill-text">{advice.daily.biaya}</span>
                    {advice.dailyBudget > 0 ? ` · anggaran harian ${formatRupiah(advice.dailyBudget)}` : ''}
                  </p>
                )}

                {advice.remainingAllowance.perDayAllowance > 0 && advice.daily.biayaMin > 0 && (
                  (() => {
                    const allow = advice.remainingAllowance.perDayAllowance;
                    const lo = advice.daily.biayaMin;
                    const hi = advice.daily.biayaMax;
                    if (lo > allow) {
                      return (
                        <div className="relative overflow-hidden rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2 mt-1">
                          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-red/40" />
                          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-red/40" />
                          <p className="text-sm text-chill-red font-medium">
                            Rencana menu hari ini (±{formatRupiah(lo)}–{formatRupiah(hi)}) melebihi sisa anggaran ±{formatRupiah(allow)} per hari untuk {advice.remainingAllowance.daysLeft} hari ke depan. Cek porsi &amp; pilih menu lebih sederhana.
                          </p>
                        </div>
                      );
                    }
                    if (hi <= allow) {
                      return (
                        <div className="relative overflow-hidden rounded-none border border-chill-sage/40 bg-chill-sage/10 px-3 py-2 mt-1">
                          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-sage/40" />
                          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-sage/40" />
                          <p className="text-sm text-chill-sage">
                            Rencana menu hari ini (±{formatRupiah(lo)}–{formatRupiah(hi)}) masih dalam sisa anggaran ±{formatRupiah(allow)} per hari.
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()
                )}
                {advice.daily.foodSpend > 0 && advice.daily.biayaMax > 0 && (
                  (() => {
                    const over = advice.daily.foodSpend - advice.daily.biayaMax;
                    if (over > 0) {
                      return (
                        <div className="relative overflow-hidden rounded-none border border-chill-red/40 bg-chill-red/10 px-3 py-2 mt-1">
                          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-red/40" />
                          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-red/40" />
                          <p className="text-sm text-chill-red font-medium">
                            Hari ini sudah tercatat {formatRupiah(advice.daily.foodSpend)} untuk makan — melebihi rencana hemat ±{formatRupiah(advice.daily.biayaMax)} ({formatRupiah(over)} lebih). Cek porsi &amp; jajan.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="relative overflow-hidden rounded-none border border-chill-sage/40 bg-chill-sage/10 px-3 py-2 mt-1">
                        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-sage/40" />
                        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-sage/40" />
                        <p className="mt-1 text-sm text-chill-sage">
                          Hari ini sudah tercatat {formatRupiah(advice.daily.foodSpend)} untuk makan — masih dalam rencana hemat ±{formatRupiah(advice.daily.biayaMax)}.
                        </p>
                      </div>
                    );
                  })()
                )}
                {advice.daily.malamSederhana && (
                  <div className="relative overflow-hidden rounded-none border border-chill-accent/40 bg-chill-accent/10 px-3 py-2 mt-1">
                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-accent/40" />
                    <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-accent/40" />
                    <p className="text-sm text-chill-text font-medium">
                      Pengeluaran makan hari ini sudah lewat rencana hemat — untuk sisa hari ini, makan malam bisa diganti:{' '}
                      <span className="text-chill-muted">{advice.daily.malamSederhana}</span>
                    </p>
                  </div>
                )}
                <DailyTip label="Sarapan">{advice.daily.sarapan}</DailyTip>
                <DailyTip label="Makan siang">{advice.daily.makanSiang}</DailyTip>
                <DailyTip label="Makan malam">{advice.daily.makanMalam}</DailyTip>
                <DailyTip label="Aktivitas">{advice.daily.aktivitas}</DailyTip>
                <DailyTip label="Tahukah kamu?">{advice.daily.funFact}</DailyTip>
                <DailyTip label="Tips anak kos">{advice.daily.tipAnakKos}</DailyTip>
              </div>

              {advice.pace && (
                <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-elevated p-3 pixel-shadow-sm">
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-border" />
                  <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-border" />
                  <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                  <div aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 bg-chill-accent/15" />
                  <h4 className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Bandingkan dengan bulan lalu</h4>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="tabular-nums text-chill-text">{formatRupiah(advice.pace.currentThroughDay)}</span>
                    <span className="text-xs text-chill-muted">s.d. hari ke-{advice.pace.day}</span>
                    <span className="text-chill-muted">·</span>
                    <span className="text-xs text-chill-muted">{advice.pace.previousMonth}</span>
                    <span className="tabular-nums text-chill-muted">{formatRupiah(advice.pace.previousThroughDay)}</span>
                  </div>
                  {(() => {
                    const p2 = advice.pace;
                    if (p2.previousThroughDay === 0 && p2.currentThroughDay === 0) {
                      return <p className="mt-1.5 text-sm text-chill-muted">Belum ada data untuk dibandingkan.</p>;
                    }
                    if (p2.previousThroughDay === 0) {
                      return <p className="mt-1.5 text-sm text-chill-muted">Belum ada data bulan lalu untuk dibandingkan.</p>;
                    }
                    const pct = p2.percentChange !== null && p2.percentChange !== undefined ? Math.abs(Math.round(p2.percentChange)) : 0;
                    if (p2.delta > 0) {
                      return (
                        <p className="mt-1.5 text-sm font-medium text-chill-red">
                          Lebih besar {formatRupiah(p2.delta)} ({pct}%) dibanding bulan lalu
                        </p>
                      );
                    }
                    if (p2.delta < 0) {
                      return (
                        <p className="mt-1.5 text-sm font-medium text-chill-sage">
                          Lebih hemat {formatRupiah(-p2.delta)} ({pct}%) dibanding bulan lalu
                        </p>
                      );
                    }
                    return <p className="mt-1.5 text-sm text-chill-muted">Pengeluaran sama dengan bulan lalu.</p>;
                  })()}
                </div>
              )}

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
                    {/* Easter egg: deep-sea bubble (Dave the Diver) — decorative, aria-hidden */}
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
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 min-w-0 text-chill-text">
                                <CategoryIcon kategori={c.kategori} className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{c.kategori}</span>
                              </span>
                              <span className="tabular-nums text-chill-muted shrink-0">{formatRupiah(c.total)}</span>
                            </div>
                            <div className="mt-1">
                              <PixelProgress percent={(c.total / trendMax) * 100} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  <div className="relative overflow-hidden rounded-none border border-chill-border bg-chill-elevated p-3 pixel-shadow-sm">
                    {/* Shared hard-edge bevel (panel frame register): chunky light top+left
                        edges frame the end-of-month projection as the headline number of the
                        analysis (glance-budget register) — the same chiseled grammar as the
                        daily-suggestion blocks, no soft gradient. */}
                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-border" />
                    <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-chill-border" />
                    <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/25" />
                    <div aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 bg-chill-accent/15" />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-chill-muted uppercase tracking-wide pixel-heading">Proyeksi akhir bulan</span>
                      <span className={`text-sm font-semibold tabular-nums ${advice.projection.projectedOver > 0 ? 'text-chill-red' : 'text-chill-accent'}`}>
                        {formatRupiah(advice.projection.projectedTotal)}{' '}
                        <span className="text-xs font-normal text-chill-muted">/ {formatRupiah(advice.projection.anggaran)}</span>
                      </span>
                    </div>
                    <div className="mt-2">
                      <PixelProgress
                        percent={(advice.projection.projectedTotal / Math.max(1, advice.projection.anggaran)) * 100}
                        tone={advice.projection.projectedOver > 0 ? 'red' : 'accent'}
                      />
                    </div>
                  </div>
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
                    <span title="Stardew Valley: a golden star for your savings goal" className="inline-flex relative">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-3.5 h-3.5 text-chill-accent">
                        <path d="M12 3l2.2 4.4 4.8.7-3.5 3.4.8 4.8L12 14.2 7.7 16.3l.8-4.8-3.5-3.4 4.8-.7z" />
                      </svg>
                      <span aria-hidden="true" className="absolute right-0 top-0 h-[2px] w-[2px] bg-white/80 pixel-shine" />
                    </span>
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
