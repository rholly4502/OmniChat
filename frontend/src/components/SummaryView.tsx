import type { ReactNode } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import { useJobsSummary } from '../hooks/useJobsSummary';
import { useEventsSummary } from '../hooks/useEventsSummary';
import { useExpenseTrend } from '../hooks/useExpenseTrend';
import type { ConversationUsageSummary } from '../types';
import type { ExpenseTrendPoint } from '../expensesApi';
import { ScanLoader } from './ScanLoader';
import { PanelFrame } from './PanelFrame';

/**
 * Props accepted by {@link SummaryView}.
 */
export interface SummaryViewProps {
  /** Backend API key; sent as `X-Api-Key` on every read request. */
  apiKey?: string;
  /** Aggregate token usage across every stored conversation (all-zero for a guest). */
  usageSummary?: ConversationUsageSummary;
  /** When provided, the "Perlu follow-up" stat becomes a button that jumps to the Jobs view filtered to overdue follow-ups. */
  onOpenFollowUps?: () => void;
  onOpenEvents?: () => void;
}

/** Pixel glyph set for the four summary cards. */
function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-5 h-5 shrink-0">
      <path d={d} />
    </svg>
  );
}

const GLYPHS = {
  chat: 'M4 5h16v14H4V5ZM4 10h16M10 5v5M15 10v5',
  expenses: 'M4 19h16M7 16V9M12 16V5M17 16v-4',
  jobs: 'M9 3h6v4H9V3ZM5 7h14v14H5V7ZM9 12h6M9 16h4',
  events: 'M8 4v4M16 4v4M4 10h16M6 7h12v13H6V7Z',
} as const;

/** Active pipeline stages (closed excluded) for the Lowongan funnel bar. */
const PIPELINE_STAGES = [
  { key: 'new', label: 'Baru', className: 'bg-chill-accent' },
  { key: 'applied', label: 'Dilamar', className: 'bg-chill-indigo' },
  { key: 'interview', label: 'Interview', className: 'bg-chill-emerald' },
  { key: 'offer', label: 'Tawaran', className: 'bg-chill-sage' },
] as const;

function Card({ title, glyph, children, tone = 'default' }: {
  title: string; glyph: string; children: ReactNode; tone?: 'default' | 'accent' | 'emerald' | 'red';
}) {
  const toneClass =
    tone === 'accent' ? 'text-chill-accent' :
    tone === 'emerald' ? 'text-emerald-400' :
    tone === 'red' ? 'text-red-400' : 'text-chill-muted';
  return (
    <section className="relative overflow-hidden rounded-none border border-chill-border bg-chill-surface p-4">
      <PanelFrame />
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-chill-text">{title}</h2>
        <span className={toneClass}><Glyph d={glyph} /></span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-chill-muted">{label}</span>
      <span className="text-sm font-medium text-chill-text">{value}</span>
    </div>
  );
}

/**
 * Top spending categories for the digest, ranked by nominal and excluding
 * savings deposits (kategori "Nabung"), so the breakdown reflects actual
 * spending — the same figure the card reports as "Total bulan ini".
 */
function topSpendCategories(
  perKategori: Record<string, number>,
  top = 4,
): [string, number][] {
  return Object.entries(perKategori)
    .filter(([kategori]) => kategori !== 'Nabung')
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
}

/**
 * Month-over-month spend change for the digest: the viewed month vs the month
 * immediately before it in the trend series. Returns null when either month is
 * missing (first month, or trend not yet loaded) so the card simply omits the
 * row instead of showing a misleading comparison.
 */
function monthCompare(
  points: readonly ExpenseTrendPoint[] | undefined,
  month: string | undefined,
): { direction: 'up' | 'down' | 'flat'; delta: number; prevMonth: string } | null {
  if (!Array.isArray(points) || points.length < 2 || !month) return null;
  const idx = points.findIndex((p) => p.month === month);
  if (idx <= 0) return null;
  const currentTotal = points[idx].total;
  const prev = points[idx - 1];
  const delta = currentTotal - prev.total;
  return {
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    delta,
    prevMonth: prev.month,
  };
}

/**
 * Ringkasan — one screen aggregating the four top-level views: chat usage,
 * monthly expenses, job pipeline, and active promo events. Each card is a
 * read-only digest that links back into its full view via the sidebar tabs.
 */
export function SummaryView({ apiKey, usageSummary, onOpenFollowUps, onOpenEvents }: SummaryViewProps) {
  const expenses = useExpenses(apiKey);
  const jobs = useJobsSummary(apiKey);
  const events = useEventsSummary(apiKey);
  const trend = useExpenseTrend(apiKey);

  const loading = expenses.loading || jobs.loading || events.loading;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ScanLoader />
      </div>
    );
  }

  const failures = [expenses.error, jobs.error, events.error].filter((e): e is string => Boolean(e));
  if (failures.length > 0) {
    const reloadAll = () => {
      expenses.reload();
      jobs.reload();
      events.reload();
      trend.reload();
    };
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div
          role="alert"
          className="rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red flex items-center justify-between gap-3"
        >
          <span>Gagal memuat sebagian data: {failures.join(' ')}</span>
          <button
            type="button"
            onClick={reloadAll}
            className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 active:bg-chill-red/25 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }

  const summary = jobs.summary;
  const statusCounts = summary?.perStatus ?? {};
  const countNew = statusCounts.new ?? 0;
  const countApplied = statusCounts.applied ?? 0;
  const countInterview = statusCounts.interview ?? 0;
  const countOffer = statusCounts.offer ?? 0;
  // Aktif = total minus closed (opportunities that are no longer open).
  const activeJobs = summary ? summary.total - (statusCounts.closed ?? 0) : 0;
  // "Perlu follow-up" = terlambat + hari ini (both are actionable right now).
  const overdueFollowUps = summary ? summary.followUpTerlambat + summary.followUpHariIni : 0;
  const todayFollowUps = summary?.followUpHariIni ?? 0;
  const weekFollowUps = summary?.followUp7Hari ?? 0;

  // Promo digest from the lightweight WIB-based /api/events/summary endpoint.
  const eventsSummary = events.summary;
  const hasExpiringSoon = eventsSummary
    ? eventsSummary.berakhirHariIni + eventsSummary.besokBerakhir + eventsSummary.dalam7Hari > 0
    : false;

  const totalTokens = usageSummary?.totalTokens ?? 0;
  const conversationCount = usageSummary?.conversationCount ?? 0;
  const spendCategories = expenses.summary ? topSpendCategories(expenses.summary.perKategori) : [];
  // Tabungan bulan ini vs target (mendukung sasaran nabung di kartu).
  const monthSavings = expenses.summary?.perKategori?.['Nabung'] ?? 0;
  const nabungTarget = expenses.summary?.targetNabung ?? 0;
  const nabungPct = nabungTarget > 0 ? Math.round((monthSavings / nabungTarget) * 100) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <header className="mb-1">
        <h1 className="text-xl font-bold text-chill-accent pixel-heading">Ringkasan</h1>
        <p className="text-xs text-chill-muted">Satu layar untuk chat, pengeluaran, lowongan, dan promo.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Chat" glyph={GLYPHS.chat} tone="accent">
          <StatRow label="Percakapan tersimpan" value={String(conversationCount)} />
          <StatRow label="Token terkumpul" value={totalTokens.toLocaleString('id-ID')} />
          {usageSummary?.byModel && Object.keys(usageSummary.byModel).length > 0 && (
            <StatRow label="Model aktif" value={String(Object.keys(usageSummary.byModel).length)} />
          )}
        </Card>

        <Card title="Pengeluaran (bulan ini)" glyph={GLYPHS.expenses} tone={expenses.summary && expenses.summary.sisaAnggaran !== null && expenses.summary.sisaAnggaran < 0 ? 'red' : 'emerald'}>
          <StatRow label="Total bulan ini" value={expenses.summary ? expenses.summary.total.toLocaleString('id-ID') : '—'} />
          <StatRow label="Anggaran" value={expenses.summary?.anggaran != null ? expenses.summary.anggaran.toLocaleString('id-ID') : '—'} />
          <StatRow label="Sisa anggaran" value={expenses.summary?.sisaAnggaran !== null && expenses.summary?.sisaAnggaran !== undefined ? expenses.summary.sisaAnggaran.toLocaleString('id-ID') : '—'} />
          {expenses.summary?.rata2Harian != null && (
            <StatRow label="Rata-rata harian" value={expenses.summary.rata2Harian.toLocaleString('id-ID')} />
          )}
          {expenses.summary?.proyeksiAkhirBulan != null && (
            <StatRow label="Proyeksi akhir bulan" value={expenses.summary.proyeksiAkhirBulan.toLocaleString('id-ID')} />
          )}
          {(() => {
            const cmp = monthCompare(trend.points, expenses.summary?.month);
            if (!cmp) return null;
            const sign = cmp.direction === 'up' ? '+' : cmp.direction === 'down' ? '−' : '';
            const toneClass =
              cmp.direction === 'up' ? 'text-chill-red' :
              cmp.direction === 'down' ? 'text-chill-emerald' : 'text-chill-muted';
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-chill-muted">Dibanding bulan lalu</span>
                <span className={`text-sm font-medium ${toneClass}`}>
                  {sign}{Math.abs(cmp.delta).toLocaleString('id-ID')}
                </span>
              </div>
            );
          })()}
          <StatRow label="Target nabung" value={expenses.summary?.targetNabung != null ? expenses.summary.targetNabung.toLocaleString('id-ID') : '—'} />
          <StatRow label="Ditabung bulan ini" value={monthSavings.toLocaleString('id-ID')} />
          <StatRow label="Dana PC terkumpul" value={expenses.summary?.totalNabungKumulatif != null ? expenses.summary.totalNabungKumulatif.toLocaleString('id-ID') : '—'} />
          {nabungPct !== null && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-chill-muted">Progres nabung</span>
                <span className="text-sm font-medium text-chill-text">{nabungPct}%</span>
              </div>
              <div className="mt-1 h-1.5 border border-chill-border bg-chill-surface overflow-hidden">
                <div className="h-full bg-chill-emerald" style={{ width: `${Math.min(100, nabungPct)}%` }} />
              </div>
            </div>
          )}
          {spendCategories.length > 0 && (
            <>
              <div className="h-px bg-chill-surface my-2" aria-hidden="true" />
              <p className="text-xs text-chill-muted">Pengeluaran per kategori</p>
              {spendCategories.map(([kategori, nominal]) => (
                <StatRow key={kategori} label={kategori} value={nominal.toLocaleString('id-ID')} />
              ))}
            </>
          )}
        </Card>

        <Card title="Lowongan" glyph={GLYPHS.jobs} tone="accent">
          <StatRow label="Aktif (belum tutup)" value={String(activeJobs)} />
          <StatRow label="Baru" value={String(countNew)} />
          <StatRow label="Sudah dilamar" value={String(countApplied)} />
          <StatRow label="Interview" value={String(countInterview)} />
          {onOpenFollowUps ? (
            <button
              type="button"
              onClick={onOpenFollowUps}
              className="w-full flex items-center justify-between gap-2 rounded-none text-left bg-transparent min-h-[44px] px-0 transition hover:bg-chill-surface/60 active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <span className="text-xs text-chill-muted">Perlu follow-up</span>
              <span className="text-sm font-medium text-chill-text">{String(overdueFollowUps)}</span>
            </button>
          ) : (
            <StatRow label="Perlu follow-up" value={String(overdueFollowUps)} />
          )}
          <StatRow label="Follow-up hari ini" value={String(todayFollowUps)} />
          <StatRow label="Dalam 7 hari" value={String(weekFollowUps)} />
          <StatRow label="Tawaran" value={String(countOffer)} />
          {statusCounts && activeJobs > 0 && (
            <div className="pt-1">
              <p className="text-xs text-chill-muted mb-2">Alur pipeline (aktif)</p>
              <div
                role="img"
                aria-label={`Alur pipeline: ${PIPELINE_STAGES.map(({ key, label }) => `${label} ${statusCounts[key] ?? 0}`).join(', ')}`}
                className="flex h-2 w-full overflow-hidden border border-chill-border bg-chill-surface"
              >
                {PIPELINE_STAGES.map(({ key, className }) => {
                  const count = statusCounts[key] ?? 0;
                  if (count <= 0) return null;
                  return <div key={key} className={`${className} h-full`} style={{ width: `${(count / activeJobs) * 100}%` }} />;
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {PIPELINE_STAGES.filter(({ key }) => (statusCounts[key] ?? 0) > 0).map(({ key, label, className }) => (
                  <span key={key} className="inline-flex items-center gap-1.5 text-xs text-chill-muted">
                    <span aria-hidden="true" className={`inline-block h-2 w-2 ${className}`} />
                    {label} · {statusCounts[key]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Promo / Event" glyph={GLYPHS.events} tone="emerald">
          <StatRow label="Total terdokumentasi" value={String(eventsSummary?.total ?? 0)} />
          <StatRow label="Sumber unik" value={String(eventsSummary?.sumberUnik ?? 0)} />
          {hasExpiringSoon && eventsSummary && (
            <>
              <StatRow label="Berakhir hari ini" value={String(eventsSummary.berakhirHariIni)} />
              <StatRow label="Besok berakhir" value={String(eventsSummary.besokBerakhir)} />
              <StatRow label="Dalam 7 hari" value={String(eventsSummary.dalam7Hari)} />
            </>
          )}
          {eventsSummary && (eventsSummary.sudahBerakhir ?? 0) > 0 && (
            <StatRow label="Sudah berakhir" value={String(eventsSummary.sudahBerakhir)} />
          )}
          {eventsSummary && (
            <>
              <StatRow label="Masih aktif tersedia" value={String(eventsSummary.sisaAktif)} />
              {eventsSummary.totalDipakai > 0 && (
                <StatRow label="Sudah dipakai" value={String(eventsSummary.totalDipakai)} />
              )}
            </>
          )}
          {onOpenEvents ? (
            <button
              type="button"
              onClick={onOpenEvents}
              className="w-full flex items-center justify-between gap-2 rounded-none text-left bg-transparent min-h-[44px] px-0 transition hover:bg-chill-surface/60 active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <span className="text-xs text-chill-muted">Lihat semua promo</span>
              <span className="text-sm font-medium text-chill-text">{String(eventsSummary?.total ?? 0)}</span>
            </button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
