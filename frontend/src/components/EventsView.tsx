import { useState } from 'react';
import type { PromoEvent } from '../eventsApi';
import { useEvents } from '../hooks/useEvents';
import { ScanLoader } from './ScanLoader';

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

/** The curated promo/event page: list grouped by app + platform filter. */
export function EventsView({ apiKey }: EventsViewProps) {
  const { events, loading, error, appFilter, setAppFilter, reload } = useEvents(apiKey);
  const [open, setOpen] = useState(true);

  const apps = appList(events);
  const filtered = appFilter ? events.filter((e) => e.aplikasi === appFilter) : events;
  const groups = [...new Set(filtered.map((e) => e.aplikasi))].sort(
    (a, b) => (filtered.filter((e) => e.aplikasi === b).length) - (filtered.filter((e) => e.aplikasi === a).length),
  );

  const activeSummary = appFilter || 'Semua';

  return (
    <div className="h-full flex flex-col min-h-0 pixel-reveal">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-base font-semibold text-chill-text">Event & Promo</h1>
        <p className="text-xs text-chill-muted mt-0.5">
          Promo bernilai terkurasi otomatis (cashback, voucher, bonus saldo) untuk platform favoritmu
        </p>
      </div>

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
        <div id="events-filters" className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter aplikasi">
            <button
              type="button"
              role="tab"
              aria-selected={appFilter === ''}
              onClick={() => setAppFilter('')}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                appFilter === ''
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:translate-y-[2px]'
              }`}
            >
              Semua ({events.length})
            </button>
            {apps.map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={appFilter === a}
                onClick={() => setAppFilter(appFilter === a ? '' : a)}
                className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                  appFilter === a
                    ? 'bg-chill-elevated text-chill-text border-chill-accent/50 active:translate-y-[2px]'
                    : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated active:translate-y-[2px]'
                }`}
              >
                {a} ({events.filter((e) => e.aplikasi === a).length})
              </button>
            ))}
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
        ) : filtered.length === 0 ? (
          <div className="border border-chill-border bg-chill-surface p-6 text-center pixel-shadow rounded-none">
            <p className="text-sm text-chill-muted">Belum ada event{appFilter ? ` untuk ${appFilter}` : ''}.</p>
            <p className="text-xs text-chill-muted mt-1">Cron Event Hunter akan mengisinya otomatis tiap hari.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => {
              const items = filtered.filter((e) => e.aplikasi === g);
              return (
                <section key={g} aria-labelledby={`app-${g}`}>
                  <div className="mb-2 border-l-2 border-chill-accent pl-2">
                    <h2 id={`app-${g}`} className="text-sm font-semibold text-chill-text">
                      {g} ({items.length})
                    </h2>
                  </div>
                  <ul className="space-y-3">
                    {items.map((e: PromoEvent) => (
                      <li key={e.id} className="rounded-none border border-chill-border bg-chill-surface p-4 pixel-shadow-sm transition hover:bg-chill-elevated">
                        <h3 className="text-sm font-semibold text-chill-text">{e.judul}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chill-muted">
                          <span>· ditemukan {e.ditemukan}</span>
                          {e.berlakuSampai && <span>· berlaku s/d {e.berlakuSampai}</span>}
                        </div>
                        {e.syarat && <p className="mt-2 text-xs text-chill-muted">{e.syarat}</p>}
                        {e.link && (
                          <a
                            href={e.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3 py-1.5 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 active:bg-chill-accent/30 active:translate-y-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                          >
                            Lihat promo →
                          </a>
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
