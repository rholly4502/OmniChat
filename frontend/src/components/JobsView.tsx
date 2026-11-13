import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { OPPORTUNITY_STATUSES, type Opportunity } from '../jobsApi';
import { useJobs } from '../hooks/useJobs';
import { ScanLoader } from './ScanLoader';
import { AlertIcon } from './Icons';

/**
 * WAI-ARIA tabs pattern (roving tabindex): given the ordered filter keys and the
 * currently selected key, return the tab index an arrow/Home/End key should move
 * to. Returns -1 for non-navigation keys or an unknown current key (callers then
 * bail without preventDefault, so Tab still works normally). Pure — no DOM/ref
 * access, so each tablist handler applies the result against its own refs.
 */
function nextTabIndex(keys: readonly string[], current: string, key: string): number {
  const idx = keys.indexOf(current);
  if (idx < 0) return -1;
  if (key === 'ArrowRight') return (idx + 1) % keys.length;
  if (key === 'ArrowLeft') return (idx - 1 + keys.length) % keys.length;
  if (key === 'Home') return 0;
  if (key === 'End') return keys.length - 1;
  return -1;
}

interface JobsViewProps {
  apiKey?: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new': return 'Baru';
    case 'applied': return 'Sudah Dilamar';
    case 'interview': return 'Interview';
    case 'offer': return 'Tawaran';
    case 'closed': return 'Tutup';
    default: return status;
  }
}

function groupOf(o: Opportunity): string {
  const t = (o.tipe || '').trim().toLowerCase();
  if (t.includes('full') || t === 'fte') return 'FTE';
  if (t.includes('kontrak') || t.includes('contract') || t.includes('b2b') || t.includes('pkwt')) return 'Kontrak';
  return (o.tipe || '').trim() || '';
}

const GROUP_ORDER = ['FTE', 'Kontrak', 'Part-time / Freelance', ''];

/** Data isian form yang diisi-otomatis saat menyiapkan paket lamaran (dari profil Rholly). */
const APPLICANT_PROFILE: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Nama', value: 'Rholly Kurnia Putra' },
  { label: 'Email', value: 'rholly4502@gmail.com' },
  { label: 'No. HP', value: '+62 821-9783-9273' },
  { label: 'GitHub', value: 'github.com/rholly4502' },
  { label: 'Zona waktu', value: 'Indonesia (WIB, UTC+7)' },
];
const GROUP_LABEL: Record<string, string> = {
  FTE: 'FTE — pengganti utama',
  Kontrak: 'Kontrak — pengganti utama',
  'Part-time / Freelance': 'Part-time / Freelance — bisa double job',
  '': 'Lainnya',
};
const GROUP_HINT: Record<string, string> = {
  FTE: 'Full-time · penghasilan utama',
  Kontrak: 'Kontrak / B2B · penghasilan utama',
  'Part-time / Freelance': 'Tambahan · bisa dijalankan di sela kerja utama',
  '': '',
};

const TYPE_FILTERS = [
  { key: '', label: 'Semua' },
  { key: 'FTE', label: 'FTE' },
  { key: 'Kontrak', label: 'Kontrak' },
  { key: 'Part-time / Freelance', label: 'Part-time / Freelance' },
];

type TierKey = 'high' | 'medium' | 'low';

const TIER_ORDER: TierKey[] = ['high', 'medium', 'low'];

/**
 * Tier rekomendasi — menandai mana yang sebaiknya dicek duluan:
 * - high: masih 'new' DAN (part-time / freelance ATAU lokasi Malaysia/Singapura) → target aktif
 * - medium: masih 'new' lainnya
 * - low: sudah diproses (applied/interview/offer/closed)
 */
function computeTier(o: Opportunity): TierKey {
  if (o.status !== 'new') return 'low';
  const tipe = (o.tipe || '').toLowerCase();
  const lokasi = (o.lokasi || '').toLowerCase();
  const partTime = tipe.includes('part-time');
  const mySg = /\b(malaysia|singapura|singapore)\b/.test(lokasi);
  if (partTime || mySg) return 'high';
  return 'medium';
}

const TIER_META: Record<TierKey, { label: string; tone: string }> = {
  high: { label: 'Prioritas', tone: 'bg-chill-red/15 text-chill-red border-chill-red/50' },
  medium: { label: 'Standar', tone: 'bg-chill-indigo/15 text-chill-indigo border-chill-indigo/40' },
  low: { label: '', tone: '' },
};

const TIER_FILTERS: { key: TierKey | ''; label: string }[] = [
  { key: '', label: 'Semua' },
  { key: 'high', label: 'Prioritas' },
  { key: 'medium', label: 'Standar' },
];

// Ordered keys per filter tablist, for the WAI-ARIA roving-tabindex nav
// (nextTabIndex + the per-group handlers below).
const TYPE_FILTER_KEYS = TYPE_FILTERS.map((f) => f.key);
const STATUS_FILTER_KEYS = ['', ...OPPORTUNITY_STATUSES];
const TIER_FILTER_KEYS = TIER_FILTERS.map((f) => f.key);

function statusTone(status: string): string {
  switch (status) {
    case 'new': return 'bg-chill-accent/15 text-chill-accent border-chill-accent/40';
    case 'applied': return 'bg-chill-sage/15 text-chill-sage border-chill-sage/40';
    case 'interview': return 'bg-chill-indigo/15 text-chill-indigo border-chill-indigo/40';
    case 'offer': return 'bg-chill-emerald/15 text-chill-emerald border-chill-emerald/40';
    case 'closed': return 'bg-chill-red/10 text-chill-muted border-chill-border';
    default: return 'bg-chill-surface text-chill-muted border-chill-border';
  }
}

/** The curated Job Opportunities page: a list of "yes" roles + pipeline filter. */
export function JobsView({ apiKey }: JobsViewProps) {
  const { opportunities, loading, error, statusFilter, setStatusFilter, reload, updateStatus, updateFollowUp, updatingId, generatingId, generateDraft, cvFiles, cvError, downloadCv } = useJobs(apiKey);
  const [typeFilter, setTypeFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [followUpEditing, setFollowUpEditing] = useState<Record<number, boolean>>({});
  const [followUpDraft, setFollowUpDraft] = useState<Record<number, string>>({});
  const [tierFilter, setTierFilter] = useState<TierKey | ''>('');
  const [draftById, setDraftById] = useState<Record<number, string>>({});
  const [draftErrorById, setDraftErrorById] = useState<Record<number, string>>({});
  const [draftOpenById, setDraftOpenById] = useState<Record<number, boolean>>({});
  const [copiedDraft, setCopiedDraft] = useState<number | null>(null);
  const [paketConfirmedById, setPaketConfirmedById] = useState<Record<number, boolean>>({});

  const handleGenerateDraft = async (o: Opportunity) => {
    try {
      const draft = await generateDraft(o.id);
      if (draft) {
        setDraftById((m) => ({ ...m, [o.id]: draft.coverLetter }));
        setDraftErrorById((m) => { const n = { ...m }; delete n[o.id]; return n; });
        setDraftOpenById((m) => ({ ...m, [o.id]: true }));
      }
    } catch {
      setDraftErrorById((m) => ({ ...m, [o.id]: 'Gagal membuat draft. Coba lagi.' }));
      setDraftOpenById((m) => ({ ...m, [o.id]: true }));
    }
  };

  const copyDraft = async (id: number) => {
    const text = draftById[id] ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedDraft(id);
    window.setTimeout(() => setCopiedDraft((c) => (c === id ? null : c)), 1500);
  };

  const openLowongan = (o: Opportunity) => {
    if (o.link) {
      window.open(o.link, '_blank', 'noopener,noreferrer');
    }
  };

  // Roving-tabindex refs for the three filter tablists (type/status/tier).
  // Only the selected tab in each list is in the tab order; arrow keys move
  // focus + selection (WAI-ARIA tabs pattern, same as the view-switcher).
  const typeTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const statusTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tierTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keyboard-navigation handlers (roving tabindex) built in the component body —
  // refs are referenced here, not in JSX, so the tablist elements only receive a
  // stable handler reference.
  const handleTypeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(TYPE_FILTER_KEYS, typeFilter, e.key);
    if (next < 0) return;
    e.preventDefault();
    setTypeFilter(TYPE_FILTER_KEYS[next]);
    typeTabRefs.current[next]?.focus();
  };
  const handleStatusKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(STATUS_FILTER_KEYS, statusFilter, e.key);
    if (next < 0) return;
    e.preventDefault();
    setStatusFilter(STATUS_FILTER_KEYS[next]);
    statusTabRefs.current[next]?.focus();
  };
  const handleTierKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(TIER_FILTER_KEYS, tierFilter, e.key);
    if (next < 0) return;
    e.preventDefault();
    setTierFilter(TIER_FILTER_KEYS[next]);
    tierTabRefs.current[next]?.focus();
  };

  // Today's date, captured once per mount. Computing `new Date()` during render
  // trips oxlint react(purity); freezing it lazily also keeps the follow-up
  // deadline (`needsFollowUp`, the date input's `min`) stable across re-renders
  // instead of drifting if the tab stays open across midnight.
  const [todayISO] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });

  /** Active (applied/interview/offer) && scheduled && overdue → needs follow-up. */
  const needsFollowUp = (o: Opportunity): boolean => {
    if (!o.followUpTanggal) return false;
    if (o.status !== 'applied' && o.status !== 'interview' && o.status !== 'offer') return false;
    return o.followUpTanggal <= todayISO;
  };

  const toggleFollowUpEdit = (id: number, current: string | null) => {
    setFollowUpEditing((m) => {
      const next = { ...m };
      next[id] = !m[id];
      return next;
    });
    setFollowUpDraft((m) => ({ ...m, [id]: current ?? todayISO }));
  };

  const saveFollowUp = (o: Opportunity) => {
    const draft = followUpDraft[o.id];
    if (draft) {
      void updateFollowUp(o.id, draft);
    } else {
      void updateFollowUp(o.id, null);
    }
    setFollowUpEditing((m) => {
      const next = { ...m };
      delete next[o.id];
      return next;
    });
  };

  const tierBadge = (o: Opportunity) => {
    const t = computeTier(o);
    if (t === 'low') return null;
    return (
      <span
        className={`shrink-0 rounded-none border px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1 ${TIER_META[t].tone}`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0">
          <rect x="0" y="0" width="8" height="8" fill="currentColor" />
        </svg>
        {TIER_META[t].label}
      </span>
    );
  };

  const scoreTone = (n: number | null): string => {
    if (n == null) return 'bg-chill-surface text-chill-muted border-chill-border';
    if (n >= 75) return 'bg-chill-emerald/15 text-chill-emerald border-chill-emerald/40';
    if (n >= 50) return 'bg-chill-indigo/15 text-chill-indigo border-chill-indigo/40';
    return 'bg-chill-red/15 text-chill-red border-chill-red/50';
  };

  const scoreBadge = (o: Opportunity) => {
    if (o.skor == null) return null;
    return (
      <span
        title={`Cocok ${o.skor}/100`}
        className={`shrink-0 rounded-none border px-2 py-0.5 text-xs font-semibold inline-flex items-center gap-1 ${scoreTone(o.skor)}`}
      >
        {o.skor}
        <span className="text-xs font-medium opacity-80">/100</span>
      </span>
    );
  };

  const statusCount = (s: string) =>
    opportunities.filter(
      (o) =>
        o.status === s && (typeFilter === '' || groupOf(o) === typeFilter)
    ).length;

  const typeCount = (g: string) =>
    opportunities.filter(
      (o) =>
        groupOf(o) === g && (statusFilter === '' || o.status === statusFilter)
    ).length;

  const tierOk = (o: Opportunity) => tierFilter === '' || computeTier(o) === tierFilter;

  const tierCount = (k: TierKey | '') =>
    opportunities.filter(
      (o) =>
        (k === '' || computeTier(o) === k) &&
        (statusFilter === '' || o.status === statusFilter) &&
        (typeFilter === '' || groupOf(o) === typeFilter)
    ).length;

  const filtered = opportunities.filter(
    (o) =>
      (statusFilter === '' || o.status === statusFilter) &&
      (typeFilter === '' || groupOf(o) === typeFilter) &&
      tierOk(o)
  );

  const activeSummary =
    [typeFilter, statusFilter ? statusLabel(statusFilter) : null]
      .filter((x): x is string => !!x)
      .join(' · ') || 'Semua';

  return (
    <div className="h-full flex flex-col min-h-0 pixel-reveal">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-base font-semibold text-chill-text">Job Opportunities</h1>
        <p className="text-xs text-chill-muted mt-0.5">
          Lowongan relevan (.NET, ±2 tahun) yang dikurasi otomatis · kontrak berakhir 30 Des
        </p>
      </div>

      {cvFiles.length > 0 && (
        <div className="px-4 pb-0">
          <div className="flex flex-wrap items-center gap-2 border border-chill-border bg-chill-surface px-3 py-2">
            <span className="text-xs font-medium text-chill-text">CV siap pakai:</span>
            {cvFiles.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void downloadCv(f)}
                className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text transition hover:bg-chill-accent/15 active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" aria-hidden="true" className="shrink-0">
                  <path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14" />
                </svg>
                {f}
              </button>
            ))}
            {cvError && (
              <span className="text-xs text-chill-red">{cvError}</span>
            )}
          </div>
        </div>
      )}

      {/* Toggle area filter (minimize di layar kecil) */}
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          aria-controls="jobs-filters"
          className="w-full flex items-center justify-between gap-2 rounded-none border border-chill-border bg-chill-surface px-3 py-2 text-xs font-medium text-chill-text transition min-h-[44px] hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        >
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="text-chill-muted shrink-0">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            Filter
            <span className="text-chill-muted">· {activeSummary}</span>
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className={`text-chill-muted shrink-0 transition-transform duration-150 [transition-timing-function:steps(3,jump-none)] ${filtersOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {filtersOpen && (
        <div id="jobs-filters" className="pixel-reveal">
      {/* Position / type filter (buttons) */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter posisi" onKeyDown={handleTypeKeyDown}>
          {TYPE_FILTERS.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={typeFilter === f.key}
              tabIndex={typeFilter === f.key ? 0 : -1}
              ref={(el) => { typeTabRefs.current[i] = el; }}
              onClick={() => setTypeFilter(typeFilter === f.key ? '' : f.key)}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                typeFilter === f.key
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              {f.label} ({typeCount(f.key)})
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline filter */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter status" onKeyDown={handleStatusKeyDown}>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === ''}
            tabIndex={statusFilter === '' ? 0 : -1}
            ref={(el) => { statusTabRefs.current[0] = el; }}
            onClick={() => setStatusFilter('')}
            className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
              statusFilter === ''
                ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
            }`}
          >
            Semua ({opportunities.filter((o) => typeFilter === '' || groupOf(o) === typeFilter).length})
          </button>
          {OPPORTUNITY_STATUSES.map((s, i) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              tabIndex={statusFilter === s ? 0 : -1}
              ref={(el) => { statusTabRefs.current[i + 1] = el; }}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                statusFilter === s
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              {statusLabel(s)} ({statusCount(s)})
            </button>
          ))}
        </div>
      </div>

      {/* Prioritas filter */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter prioritas" onKeyDown={handleTierKeyDown}>
          {TIER_FILTERS.map((f, i) => (
            <button
              key={f.key || 'semua'}
              type="button"
              role="tab"
              aria-selected={tierFilter === f.key}
              tabIndex={tierFilter === f.key ? 0 : -1}
              ref={(el) => { tierTabRefs.current[i] = el; }}
              onClick={() => setTierFilter(tierFilter === f.key ? '' : f.key)}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                tierFilter === f.key
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              {f.label} ({tierCount(f.key)})
            </button>
          ))}
        </div>
      </div>

        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 active:bg-chill-red/25 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 min-h-0">
        {loading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-chill-muted py-10" role="status">
            <ScanLoader />
            Mencari lowongan…
          </p>
        ) : filtered.length === 0 ? (
          <div className="border border-chill-border bg-chill-surface p-6 text-center pixel-shadow rounded-none">
            <p className="text-sm text-chill-muted">
              Belum ada lowongan
              {statusFilter ? ` berstatus ${statusLabel(statusFilter)}` : ''}
              {typeFilter ? ` tipe ${typeFilter}` : ''}.
            </p>
            <p className="text-xs text-chill-muted mt-1">
              Cron Job Hunter akan mengisinya otomatis tiap hari.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {GROUP_ORDER.filter((g) => filtered.some((o) => groupOf(o) === g)).map((g) => {
              const items = filtered
                .filter((o) => groupOf(o) === g)
                .slice()
                .sort(
                  (a, b) =>
                    TIER_ORDER.indexOf(computeTier(a)) - TIER_ORDER.indexOf(computeTier(b))
                );
              return (
                <section key={g} aria-labelledby={`group-${g}`}>
                  <div className="mb-2 border-l-2 border-chill-accent pl-2">
                    <h2 id={`group-${g}`} className="text-sm font-semibold text-chill-text">
                      {GROUP_LABEL[g]} ({items.length})
                    </h2>
                    <p className="text-xs text-chill-muted">{GROUP_HINT[g]}</p>
                  </div>
                  <ul className="space-y-3">
            {items.map((o: Opportunity) => (
              <li
                key={o.id}
                className="rounded-none border border-chill-border bg-chill-surface p-4 pixel-shadow-sm transition hover:bg-chill-elevated"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-chill-text">{o.judul}</h3>
                    <p className="text-xs text-chill-muted mt-0.5">
                      {o.perusahaan} · {o.lokasi}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-none border px-2 py-0.5 text-xs font-medium ${statusTone(o.status)}`}
                  >
                    {statusLabel(o.status)}
                  </span>
                  {tierBadge(o)}
                  {scoreBadge(o)}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chill-muted">
                  {o.tipe && <span>· {o.tipe}</span>}
                  {o.gaji && <span>· {o.gaji}</span>}
                  <span>· ditemukan {o.ditemukan}</span>
                </div>

                {o.catatan && (
                  <p className="mt-2 text-xs text-chill-muted">{o.catatan}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                  {o.link && (
                    <a
                      href={o.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3 py-1.5 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/30 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                    >
                      Lihat lowongan →
                    </a>
                  )}
                  <span className="text-xs text-chill-muted" aria-hidden="true">
                    •
                  </span>
                  <span className="inline-flex items-center gap-1.5 flex-wrap" role="group" aria-label="Ubah status">
                    {OPPORTUNITY_STATUSES.filter((s) => s !== o.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={updatingId === o.id}
                        onClick={() => updateStatus(o.id, s)}
                        className={`rounded-none border px-2.5 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px] disabled:active:translate-y-0 ${
                          updatingId === o.id
                            ? 'opacity-50 cursor-wait border-chill-border text-chill-muted bg-chill-surface'
                            : 'border-chill-border bg-chill-surface text-chill-muted hover:bg-chill-elevated hover:text-chill-text'
                        }`}
                      >
                        {statusLabel(s)}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    disabled={generatingId === o.id}
                    onClick={() => void handleGenerateDraft(o)}
                    className={`rounded-none border px-3 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px] disabled:active:translate-y-0 ${generatingId === o.id ? 'border-chill-border bg-chill-surface text-chill-muted cursor-wait' : 'border-chill-accent/50 bg-chill-accent/10 text-chill-accent hover:bg-chill-accent/20 active:bg-chill-accent/30'}`}
                  >
                    {generatingId === o.id ? 'Menyusun…' : (draftById[o.id] ? 'Buat ulang draft' : 'Buat draft lamaran')}
                  </button>
                </div>

                {draftOpenById[o.id] && (
                  <div className="mt-3 border border-chill-border bg-chill-surface p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-chill-text">Draft lamaran (draf untuk direview)</span>
                      {draftById[o.id] && (
                        <button
                          type="button"
                          onClick={() => void copyDraft(o.id)}
                          className="rounded-none border border-chill-accent/50 bg-chill-accent/10 px-2.5 py-1 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/30 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px]"
                        >
                          {copiedDraft === o.id ? 'Tersalin ✓' : 'Salin'}
                        </button>
                      )}
                    </div>
                    {draftErrorById[o.id] && (
                      <p className="text-xs text-chill-red mb-2">{draftErrorById[o.id]}</p>
                    )}
                    {generatingId === o.id ? (
                      <p className="flex items-center gap-2 text-xs text-chill-muted py-2" role="status">
                        <ScanLoader />
                        Mengirim ke gateway AI…
                      </p>
                    ) : draftById[o.id] ? (
                      <textarea
                        value={draftById[o.id]}
                        onChange={(e) => setDraftById((m) => ({ ...m, [o.id]: e.target.value }))}
                        aria-label={`Draft lamaran untuk ${o.judul}`}
                        rows={10}
                        className="w-full rounded-none border border-chill-border bg-chill-surface px-3 py-2 text-base text-chill-text leading-relaxed transition-colors hover:border-chill-accent/60 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 resize-y"
                      />
                    ) : (
                      <p className="text-xs text-chill-muted">Klik tombol di atas untuk membuat draft.</p>
                    )}

                    {/* Paket lamaran (auto-prep + gate review) */}
                    <div className="mt-4 border-t border-chill-border pt-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-chill-text">Paket lamaran</span>
                        <span className="text-xs text-chill-muted">Diisi otomatis — review sebelum kirim</span>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 mb-3">
                        {APPLICANT_PROFILE.map((f) => (
                          <div key={f.label} className="flex items-baseline gap-2 text-xs">
                            <span className="w-24 shrink-0 text-chill-muted">{f.label}</span>
                            <span className="text-chill-text">{f.value}</span>
                          </div>
                        ))}
                      </div>

                      {cvFiles.length > 0 && (
                        <div className="mb-3">
                          <span className="text-xs text-chill-muted block mb-1">Lampiran CV:</span>
                          <div className="flex flex-wrap gap-2">
                            {cvFiles.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => void downloadCv(f)}
                                className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text transition hover:bg-chill-accent/15 active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" aria-hidden="true" className="shrink-0">
                                  <path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14" />
                                </svg>
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {o.link && (
                        <div className="flex flex-col gap-2">
                          <label className="flex items-start gap-2 text-xs text-chill-muted cursor-pointer transition-colors [transition-timing-function:steps(2,jump-none)] hover:text-chill-accent">
                            <input
                              type="checkbox"
                              checked={!!paketConfirmedById[o.id]}
                              onChange={(e) => setPaketConfirmedById((m) => ({ ...m, [o.id]: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 pixel-checkbox"
                            />
                            <span>Saya sudah mereview draft & data di atas. Kirim lamaran manual ke halaman lowongan.</span>
                          </label>
                          <button
                            type="button"
                            disabled={!paketConfirmedById[o.id]}
                            onClick={() => openLowongan(o)}
                            className={`rounded-none border px-3 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px] disabled:active:translate-y-0 ${
                              paketConfirmedById[o.id]
                                ? 'border-chill-accent/50 bg-chill-accent/10 text-chill-accent hover:bg-chill-accent/20 active:bg-chill-accent/30'
                                : 'border-chill-border bg-chill-surface text-chill-muted opacity-60 cursor-not-allowed'
                            }`}
                          >
                            Buka halaman lowongan →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-3 border-t border-chill-border pt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {needsFollowUp(o) && (
                    <span
                      className="inline-flex items-center gap-1 rounded-none border border-chill-red/50 bg-chill-red/15 px-2 py-0.5 text-xs font-semibold text-chill-red"
                    >
                      <AlertIcon size={14} />
                      Perlu follow-up
                    </span>
                  )}
                  {o.followUpTanggal && !needsFollowUp(o) && (
                    <span className="text-xs text-chill-muted">Follow-up s/d {o.followUpTanggal}</span>
                  )}
                  {followUpEditing[o.id] ? (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <input
                        type="date"
                        value={followUpDraft[o.id] ?? ''}
                        min={todayISO}
                        onChange={(e) => setFollowUpDraft((m) => ({ ...m, [o.id]: e.target.value }))}
                        aria-label="Tanggal follow-up"
                        className="rounded-none border border-chill-border bg-chill-surface px-2 py-1.5 text-base text-chill-text transition-colors hover:border-chill-accent/60 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 [color-scheme:dark]"
                      />
                      <button
                        type="button"
                        disabled={updatingId === o.id}
                        onClick={() => saveFollowUp(o)}
                        className="rounded-none border border-chill-accent/50 bg-chill-accent/10 px-2.5 py-1.5 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/30 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-chill-accent/10 disabled:active:bg-chill-accent/10 disabled:active:translate-y-0"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => { void updateFollowUp(o.id, null); setFollowUpEditing((m) => { const n = { ...m }; delete n[o.id]; return n; }); }}
                        className="rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:bg-chill-elevated min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px]"
                      >
                        Hapus
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleFollowUpEdit(o.id, o.followUpTanggal ?? null)}
                      className="rounded-none border border-chill-border px-2.5 py-1.5 text-xs font-medium text-chill-muted transition hover:bg-chill-elevated hover:text-chill-text min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 active:translate-y-[2px]"
                    >
                      {o.followUpTanggal ? 'Ubah follow-up' : 'Atur follow-up'}
                    </button>
                  )}
                </div>
              </li>
            ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
