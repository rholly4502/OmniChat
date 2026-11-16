import { useState } from 'react';
import type { ReactNode } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import { useJobs } from '../hooks/useJobs';
import { useEvents } from '../hooks/useEvents';
import type { ConversationUsageSummary } from '../types';
import type { Opportunity } from '../jobsApi';
import { OPPORTUNITY_STATUSES } from '../jobsApi';
import { countdownLabel, daysRemaining } from '../eventsStatus';
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
 * YYYY-MM-DD shifted by `days` (WIB-anchored; UTC math keeps ranges stable).
 */
function dayOffsetISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
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
 * Ringkasan — one screen aggregating the four top-level views: chat usage,
 * monthly expenses, job pipeline, and active promo events. Each card is a
 * read-only digest that links back into its full view via the sidebar tabs.
 */
export function SummaryView({ apiKey, usageSummary, onOpenFollowUps, onOpenEvents }: SummaryViewProps) {
  // Today captured once per mount (WIB local); keeps the follow-up deadline stable.
  const [todayISO] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
  const needsFollowUp = (o: Opportunity): boolean => {
    if (!o.followUpTanggal) return false;
    if (o.status !== 'applied' && o.status !== 'interview' && o.status !== 'offer') return false;
    return o.followUpTanggal <= todayISO;
  };
  const expenses = useExpenses(apiKey);
  const jobs = useJobs(apiKey);
  const events = useEvents(apiKey);

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

  const statusCounts = Object.fromEntries(OPPORTUNITY_STATUSES.map((s) => [s, 0]));
  for (const o of jobs.opportunities) {
    if (Object.prototype.hasOwnProperty.call(statusCounts, o.status)) statusCounts[o.status] += 1;
  }
  const activeJobs = jobs.opportunities.filter((o) => o.status !== 'closed').length;
  const overdueFollowUps = jobs.opportunities.filter(needsFollowUp).length;

  const activeFollowUpStage = (o: Opportunity) =>
    o.status === 'applied' || o.status === 'interview' || o.status === 'offer';
  const todayFollowUps = jobs.opportunities.filter(
    (o) => o.followUpTanggal != null && activeFollowUpStage(o) && o.followUpTanggal === todayISO,
  ).length;
  const weekEndISO = dayOffsetISO(todayISO, 7);
  const weekFollowUps = jobs.opportunities.filter(
    (o) =>
      o.followUpTanggal != null &&
      activeFollowUpStage(o) &&
      o.followUpTanggal > todayISO &&
      o.followUpTanggal <= weekEndISO,
  ).length;

  // Promo expiring within 7 days, bucketed like the event countdown labels.
  const eventsToday = events.events.filter(
    (e) => countdownLabel(e.berlakuSampai, todayISO) === 'berakhir hari ini',
  ).length;
  const eventsTomorrow = events.events.filter(
    (e) => countdownLabel(e.berlakuSampai, todayISO) === 'besok berakhir',
  ).length;
  const eventsWeek = events.events.filter((e) => {
    const d = daysRemaining(e.berlakuSampai, todayISO);
    return d !== null && d >= 2 && d <= 7;
  }).length;
  const hasExpiringSoon = eventsToday + eventsTomorrow + eventsWeek > 0;

  const totalTokens = usageSummary?.totalTokens ?? 0;
  const conversationCount = usageSummary?.conversationCount ?? 0;
  const spendCategories = expenses.summary ? topSpendCategories(expenses.summary.perKategori) : [];

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
          <StatRow label="Sisa anggaran" value={expenses.summary?.sisaAnggaran !== null && expenses.summary?.sisaAnggaran !== undefined ? expenses.summary.sisaAnggaran.toLocaleString('id-ID') : '—'} />
          <StatRow label="Target nabung" value={expenses.summary?.targetNabung != null ? expenses.summary.targetNabung.toLocaleString('id-ID') : '—'} />
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
          <StatRow label="Baru" value={String(statusCounts.new)} />
          <StatRow label="Sudah dilamar" value={String(statusCounts.applied)} />
          <StatRow label="Interview" value={String(statusCounts.interview)} />
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
          <StatRow label="Tawaran" value={String(statusCounts.offer)} />
        </Card>

        <Card title="Promo / Event" glyph={GLYPHS.events} tone="emerald">
          <StatRow label="Total terdokumentasi" value={String(events.events.length)} />
          <StatRow label="Sumber unik" value={String(new Set(events.events.map((e) => e.aplikasi)).size)} />
          {hasExpiringSoon && (
            <>
              <StatRow label="Berakhir hari ini" value={String(eventsToday)} />
              <StatRow label="Besok berakhir" value={String(eventsTomorrow)} />
              <StatRow label="Dalam 7 hari" value={String(eventsWeek)} />
            </>
          )}
          {onOpenEvents ? (
            <button
              type="button"
              onClick={onOpenEvents}
              className="w-full flex items-center justify-between gap-2 rounded-none text-left bg-transparent min-h-[44px] px-0 transition hover:bg-chill-surface/60 active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <span className="text-xs text-chill-muted">Lihat semua promo</span>
              <span className="text-sm font-medium text-chill-text">{String(events.events.length)}</span>
            </button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}