import { OPPORTUNITY_STATUSES, type Opportunity } from '../jobsApi';
import { useJobs } from '../hooks/useJobs';

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
  const { opportunities, loading, error, statusFilter, setStatusFilter, reload } = useJobs(apiKey);

  const counts = (s: string) =>
    s === '' ? opportunities.length : opportunities.filter((o) => o.status === s).length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-base font-semibold text-chill-text">Job Opportunities</h1>
        <p className="text-xs text-chill-muted mt-0.5">
          Lowongan relevan (.NET, ±2 tahun) yang dikurasi otomatis · kontrak berakhir 30 Des
        </p>
      </div>

      {/* Pipeline filter */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter status">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === ''}
            onClick={() => setStatusFilter('')}
            className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
              statusFilter === ''
                ? 'bg-chill-elevated text-chill-text border-chill-accent/50'
                : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated'
            }`}
          >
            Semua ({counts('')})
          </button>
          {OPPORTUNITY_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`rounded-none px-3 py-1.5 text-xs font-medium transition min-h-[44px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                statusFilter === s
                  ? 'bg-chill-elevated text-chill-text border-chill-accent/50'
                  : 'bg-chill-surface text-chill-muted border-chill-border hover:bg-chill-elevated'
              }`}
            >
              {statusLabel(s)} ({counts(s)})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-none border border-chill-red/40 bg-chill-red/10 px-4 py-3 text-sm text-chill-red flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-none border border-chill-red/50 px-3 py-1.5 text-xs font-medium text-chill-red transition hover:bg-chill-red/15 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 min-h-0">
        {loading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-chill-muted py-10" role="status">
            <span className="w-2.5 h-2.5 bg-chill-accent rounded-none pixel-blink" aria-hidden="true" />
            Mencari lowongan…
          </p>
        ) : opportunities.length === 0 ? (
          <div className="border border-chill-border bg-chill-surface p-6 text-center pixel-shadow rounded-none">
            <p className="text-sm text-chill-muted">
              Belum ada lowongan{statusFilter ? ` berstatus ${statusLabel(statusFilter)}` : ''}.
            </p>
            <p className="text-xs text-chill-muted mt-1">
              Cron Job Hunter akan mengisinya otomatis tiap hari.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {opportunities.map((o: Opportunity) => (
              <li
                key={o.id}
                className="rounded-none border border-chill-border bg-chill-surface p-4 pixel-shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-chill-text">{o.judul}</h3>
                    <p className="text-xs text-chill-muted mt-0.5">
                      {o.perusahaan} · {o.lokasi}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-none border px-2 py-0.5 text-[11px] font-medium ${statusTone(o.status)}`}
                  >
                    {statusLabel(o.status)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chill-muted">
                  {o.tipe && <span>· {o.tipe}</span>}
                  {o.gaji && <span>· {o.gaji}</span>}
                  <span>· ditemukan {o.ditemukan}</span>
                </div>

                {o.catatan && (
                  <p className="mt-2 text-xs text-chill-muted">{o.catatan}</p>
                )}

                {o.link && (
                  <a
                    href={o.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-none border border-chill-accent/50 bg-chill-accent/10 px-3 py-1.5 text-xs font-medium text-chill-accent transition hover:bg-chill-accent/20 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  >
                    Lihat lowongan →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
