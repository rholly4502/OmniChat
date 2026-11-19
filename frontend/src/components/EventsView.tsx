import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  createEvent,
  deleteEvent,
  exportEventsCsv,
  exportEventsPdf,
  updateEvent,
  type EventWritePayload,
  type PromoEvent,
} from '../eventsApi';
import { ApiError } from '../api';
import { useEvents } from '../hooks/useEvents';
import { usePersistedState } from '../hooks/usePersistedState';
import { ScanLoader } from './ScanLoader';
import { PanelFrame } from './PanelFrame';
import { STATUS_CHIP, countdownLabel, eventStatus, sortEventsByUrgency, type EventStatus } from '../eventsStatus';

/**
 * WAI-ARIA tabs pattern (roving tabindex): given the ordered filter keys and the
 * currently selected key, return the tab index an arrow/Home/End key should move
 * to. Returns -1 for non-navigation keys or an unknown current key (callers then
 * bail without preventDefault, so Tab still works normally). Pure — no DOM/ref
 * access, so the tablist handler applies the result against its own refs.
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

interface EventsViewProps {
  apiKey?: string;
}

/** Sorted, stable application list for the filter buttons (most events first). */
function appList(events: PromoEvent[]): string[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.aplikasi, (counts.get(e.aplikasi) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([app]) => app);
}

/** Today's date in WIB as YYYY-MM-DD (default for new events). */
function wibToday(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/** The curated promo/event page: list grouped by app + platform filter, plus manual curation. */
export function EventsView({ apiKey }: EventsViewProps) {
  const { events, loading, error, appFilter, setAppFilter, reload, updatingId, updateDipakai } = useEvents(apiKey);
  const [open, setOpen] = useState(true);
  const [searchQuery, setSearchQuery] = usePersistedState('events.query', '');
  const [hideExpired, setHideExpired] = usePersistedState('events.hideExpired', false);
  const [hideUsed, setHideUsed] = usePersistedState('events.hideUsed', false);
  const [exportError, setExportError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PromoEvent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleExportCsv = async () => {
    try {
      const blob = await exportEventsCsv(
        { apiKey },
        appFilter || undefined,
        searchQuery.trim() || undefined,
        hideExpired || undefined,
        hideUsed || undefined,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportError('');
    } catch {
      setExportError('Gagal mengekspor CSV.');
    }
  };

  const handleExportPdf = async () => {
    try {
      const blob = await exportEventsPdf(
        { apiKey },
        appFilter || undefined,
        searchQuery.trim() || undefined,
        hideExpired || undefined,
        hideUsed || undefined,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `events-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportError('');
    } catch {
      setExportError('Gagal mengekspor PDF.');
    }
  };

  async function handleSave(payload: EventWritePayload) {
    if (!apiKey) {
      setFormError('API key diperlukan untuk menyimpan event.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingItem) {
        await updateEvent(editingItem.id, payload, { apiKey });
      } else {
        await createEvent(payload, { apiKey });
      }
      setShowForm(false);
      setEditingItem(null);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? `Gagal menyimpan (${err.status}).` : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: PromoEvent) {
    setEditingItem(item);
    setShowForm(true);
    setFormError(null);
  }

  function openCreate() {
    setEditingItem(null);
    setShowForm(true);
    setFormError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
    setFormError(null);
  }

  async function handleDelete(item: PromoEvent) {
    if (!apiKey) {
      setExportError('API key diperlukan untuk menghapus event.');
      return;
    }
    if (!window.confirm(`Hapus event "${item.judul}"?`)) return;
    try {
      await deleteEvent(item.id, { apiKey });
      reload();
    } catch (err) {
      setExportError(err instanceof ApiError ? `Gagal menghapus (${err.status}).` : 'Gagal menghapus.');
    }
  }

  const apps = appList(events);
  // Filter pills are `Semua` (empty key) + one per app; order is the render order.
  const appKeys = ['', ...apps];
  const appTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keyboard-navigation handler (roving tabindex) built in the component body —
  // refs are referenced here, not in JSX, so the tablist only receives a stable
  // handler reference.
  const handleAppKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(appKeys, appFilter, e.key);
    if (next < 0) return;
    e.preventDefault();
    setAppFilter(appKeys[next]);
    appTabRefs.current[next]?.focus();
  };
  const query = searchQuery.trim().toLowerCase();
  const byApp = appFilter ? events.filter((e) => e.aplikasi === appFilter) : events;
  const filtered = query
    ? byApp.filter(
        (e) =>
          e.judul.toLowerCase().includes(query) ||
          e.aplikasi.toLowerCase().includes(query) ||
          (e.benefit ?? '').toLowerCase().includes(query) ||
          (e.syarat ?? '').toLowerCase().includes(query),
      )
    : byApp;
  const nowWib = wibToday();
  const statusById = new Map<number, EventStatus>(
    filtered.map((e) => [e.id, eventStatus(e.berlakuSampai, nowWib)]),
  );
  // When "Sembunyikan kedaluwarsa" is on, drop expired promos entirely instead of
  // only dimming them — an expired promo is not actionable, so it should not
  // occupy space in the list (app/keyword filters still apply first).
  const visible = filtered.filter(
    (e) =>
      (!hideExpired || statusById.get(e.id) !== 'kedaluwarsa') &&
      (!hideUsed || !e.dipakai),
  );
  const groups = [...new Set(visible.map((e) => e.aplikasi))].sort(
    (a, b) => (visible.filter((e) => e.aplikasi === b).length) - (visible.filter((e) => e.aplikasi === a).length),
  );

  const activeSummary = appFilter || 'Semua';

  return (
    <div className="h-full flex flex-col min-h-0 pixel-reveal">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-chill-text">Event & Promo</h1>
          <p className="text-xs text-chill-muted mt-0.5">
            Promo bernilai terkurasi otomatis (cashback, voucher, bonus saldo) untuk platform favoritmu
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            disabled={loading}
            aria-label="Tambah event"
            className="inline-flex items-center gap-1.5 rounded-none border border-chill-accent/60 bg-chill-accent px-3 py-2 text-xs font-semibold text-chill-on-accent transition min-h-[44px] hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="shrink-0">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Tambah
          </button>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={loading}
            aria-label="Ekspor CSV"
            className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-surface px-3 py-2 text-xs font-medium text-chill-text transition min-h-[44px] hover:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" className="shrink-0">
              <path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14" />
            </svg>
            Ekspor CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={loading}
            aria-label="Ekspor PDF"
            className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-surface px-3 py-2 text-xs font-medium text-chill-text transition min-h-[44px] hover:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true" className="shrink-0">
              <path d="M6 3h9l3 3v15H6V3Z" />
            </svg>
            Ekspor PDF
          </button>
          {(exportError || formError) && (
            <p role="alert" className="mt-1 text-xs text-chill-red">{exportError || formError}</p>
          )}
        </div>
      </div>

      {showForm && (
        <div className="px-4 pb-2">
          <EventForm
            initial={editingItem}
            saving={saving}
            error={formError}
            onSave={(p) => void handleSave(p)}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Toggle area filter */}
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="events-filters"
          className="w-full flex items-center justify-between gap-2 rounded-none border border-chill-border bg-chill-surface px-3 py-2 text-xs font-medium text-chill-text transition min-h-[44px] hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className={`text-chill-muted shrink-0 transition-transform duration-150 [transition-timing-function:steps(3,jump-none)] ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div id="events-filters" className="px-4 pb-2 pixel-reveal">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter aplikasi" onKeyDown={handleAppKeyDown}>
            <button
              type="button"
              role="tab"
              aria-selected={appFilter === ''}
              tabIndex={appFilter === '' ? 0 : -1}
              ref={(el) => { appTabRefs.current[0] = el; }}
              onClick={() => setAppFilter('')}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                appFilter === ''
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              Semua ({events.length})
            </button>
            {apps.map((a, i) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={appFilter === a}
                tabIndex={appFilter === a ? 0 : -1}
                ref={(el) => { appTabRefs.current[i + 1] = el; }}
                onClick={() => setAppFilter(appFilter === a ? '' : a)}
                className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                  appFilter === a
                    ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                    : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
                }`}
              >
                {a} ({events.filter((e) => e.aplikasi === a).length})
              </button>
            ))}
          </div>
          <div className="mt-2 relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari promo… (judul / benefit / syarat)"
              aria-label="Cari event"
              className="w-full bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
            />
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setHideExpired((v) => !v)}
              aria-pressed={hideExpired}
              className={`inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                hideExpired
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="shrink-0">
                <path d="M3 7h18l-7 9v4l-4-2v-2L3 7Z" />
              </svg>
              Sembunyikan kedaluwarsa
            </button>
            <button
              type="button"
              onClick={() => setHideUsed((v) => !v)}
              aria-pressed={hideUsed}
              className={`inline-flex items-center gap-2 rounded-none border px-3 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                hideUsed
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="shrink-0">
                <path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              Sembunyikan yang sudah dipakai
            </button>
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
            Memuat event…
          </p>
        ) : visible.length === 0 ? (
          <div className="border border-chill-border bg-chill-surface p-6 text-center pixel-shadow rounded-none">
            <p className="text-sm text-chill-muted">
              Belum ada event{appFilter ? ` untuk ${appFilter}` : ''}{query ? ` cocok “${searchQuery}”` : ''}{hideExpired ? ' yang masih aktif' : ''}{hideUsed ? ' yang belum dipakai' : ''}.
            </p>
            <p className="text-xs text-chill-muted mt-1">Cron Event Hunter akan mengisinya otomatis tiap hari.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => {
              const items = sortEventsByUrgency(visible.filter((e) => e.aplikasi === g), nowWib);
              return (
                <section key={g} aria-labelledby={`app-${g}`}>
                  <div className="mb-2 border-l-2 border-chill-accent pl-2">
                    <h2 id={`app-${g}`} className="text-sm font-semibold text-chill-text">
                      {g} ({items.length})
                    </h2>
                  </div>
                  <ul className="space-y-3">
                    {items.map((e: PromoEvent) => (
                      <li
                        key={e.id}
                        className={`rounded-none border border-chill-border bg-chill-surface p-4 pixel-shadow-sm transition hover:bg-chill-elevated ${
                          statusById.get(e.id) === 'kedaluwarsa' ? 'opacity-55' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-chill-text">{e.judul}</h3>
                          {statusById.get(e.id) !== 'tanpa-batas' && (
                            <span
                              aria-label={STATUS_CHIP[statusById.get(e.id)!].text}
                              className={`shrink-0 rounded-none border px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[statusById.get(e.id)!].cls}`}
                            >
                              {STATUS_CHIP[statusById.get(e.id)!].text}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chill-muted">
                          <span>· ditemukan {e.ditemukan}</span>
                          {e.berlakuSampai && <span>· berlaku s/d {e.berlakuSampai}</span>}
                          {countdownLabel(e.berlakuSampai, nowWib) && (
                            <span className="font-semibold text-chill-accent">
                              · {countdownLabel(e.berlakuSampai, nowWib)}
                            </span>
                          )}
                        </div>
                        {e.syarat && <p className="mt-2 text-xs text-chill-muted">{e.syarat}</p>}
                        {(e.link || !loading) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {e.link && (
                              <a
                                href={e.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3 py-1.5 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/30 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                              >
                                Lihat promo →
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(e)}
                              className="inline-block rounded-none border border-chill-border px-3 py-1.5 text-xs font-medium text-chill-muted transition hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateDipakai(e.id, !e.dipakai)}
                              disabled={updatingId === e.id}
                              aria-pressed={Boolean(e.dipakai)}
                              className={`inline-block rounded-none border px-3 py-1.5 text-xs font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 disabled:opacity-50 ${
                                e.dipakai
                                  ? 'border-chill-emerald/50 bg-chill-emerald/10 text-chill-emerald hover:bg-chill-emerald/20 active:bg-chill-emerald/25'
                                  : 'border-chill-border text-chill-muted hover:bg-chill-elevated active:bg-chill-elevated'
                              } active:translate-y-[2px]`}
                            >
                              {e.dipakai ? 'Batal pakai' : 'Tandai sudah dipakai'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(e)}
                              className="inline-block rounded-none border border-chill-red/40 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/10 active:bg-chill-red/15 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
                            >
                              Hapus
                            </button>
                          </div>
                        )}
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

interface EventFormProps {
  initial: PromoEvent | null;
  saving: boolean;
  error: string | null;
  onSave: (payload: EventWritePayload) => void;
  onCancel: () => void;
}

/** Small inline form to add or edit one curated promo event. */
function EventForm({ initial, saving, error, onSave, onCancel }: EventFormProps) {
  const [aplikasi, setAplikasi] = useState(initial?.aplikasi ?? '');
  const [judul, setJudul] = useState(initial?.judul ?? '');
  const [benefit, setBenefit] = useState(initial?.benefit ?? '');
  const [syarat, setSyarat] = useState(initial?.syarat ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [berlakuSampai, setBerlakuSampai] = useState(initial?.berlakuSampai ?? '');
  const [ditemukan, setDitemukan] = useState(initial?.ditemukan ?? wibToday());
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    if (!aplikasi.trim()) {
      setLocalError('Aplikasi wajib diisi.');
      return;
    }
    if (!judul.trim()) {
      setLocalError('Judul wajib diisi.');
      return;
    }
    if (!ditemukan) {
      setLocalError('Tanggal ditemukan wajib diisi.');
      return;
    }
    setLocalError(null);
    onSave({
      aplikasi: aplikasi.trim(),
      judul: judul.trim(),
      benefit: benefit.trim() || undefined,
      syarat: syarat.trim() || undefined,
      link: link.trim() || undefined,
      berlakuSampai: berlakuSampai.trim() || undefined,
      ditemukan,
    });
  }

  return (
    <section
      aria-label={initial ? 'Edit event' : 'Tambah event'}
      className="relative overflow-hidden rounded-none bg-chill-surface border border-chill-accent/40 p-4 pixel-shadow-sm space-y-3"
    >
      <PanelFrame />
      <h3 className="text-sm font-semibold text-chill-text pixel-heading">
        {initial ? 'Edit Event' : 'Tambah Event'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Aplikasi
          <input
            type="text"
            maxLength={64}
            value={aplikasi}
            onChange={(e) => setAplikasi(e.target.value)}
            placeholder="Mis. GoPay"
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Judul
          <input
            type="text"
            maxLength={500}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Mis. Cashback 50% GoPay Coins"
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Benefit (opsional)
          <input
            type="text"
            maxLength={500}
            value={benefit}
            onChange={(e) => setBenefit(e.target.value)}
            placeholder="Mis. Cashback 50%"
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Berlaku s/d (opsional)
          <input
            type="text"
            maxLength={64}
            value={berlakuSampai}
            onChange={(e) => setBerlakuSampai(e.target.value)}
            placeholder="Mis. 31 Des 2026"
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Link promo (opsional)
          <input
            type="url"
            maxLength={1000}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-chill-muted">
          Tanggal ditemukan
          <input
            type="date"
            value={ditemukan}
            onChange={(e) => setDitemukan(e.target.value)}
            className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-chill-muted">
        Syarat & ketentuan (opsional)
        <textarea
          maxLength={2000}
          rows={3}
          value={syarat}
          onChange={(e) => setSyarat(e.target.value)}
          placeholder="Mis. Min. transaksi Rp50.000"
          className="bg-chill-bg border border-chill-border rounded-none px-3 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] text-chill-text pixel-shadow-sm [color-scheme:dark] resize-y"
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
          className="rounded-none border border-chill-accent/60 bg-chill-accent px-4 py-2 text-sm font-semibold text-chill-on-accent transition hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70 min-h-[44px] disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Menyimpan…' : initial ? 'Simpan Perubahan' : 'Simpan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-none border border-chill-border px-4 py-2 text-sm font-medium text-chill-muted transition hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] disabled:opacity-50 disabled:shadow-none"
        >
          Batal
        </button>
      </div>
    </section>
  );
}
