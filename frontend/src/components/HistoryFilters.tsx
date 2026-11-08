import type { ModelOption } from '../types';

/** Props accepted by {@link HistoryFilters}. */
export interface HistoryFiltersProps {
  /** Model choices for the dropdown (usually the active mode's catalog). */
  models: ModelOption[];
  /** Selected model filter; empty string means "all models". */
  modelFilter: string;
  /** Model filter change handler ("" resets). */
  onModelFilterChange: (model: string) => void;
  /** Selected chat-mode filter; empty string means "all modes". */
  modeFilter: string;
  /** Chat-mode filter change handler ("" resets). */
  onModeFilterChange: (mode: string) => void;
  /** Inclusive start date (ISO `yyyy-MM-dd`) or "" for "no lower bound". */
  dateFrom: string;
  /** Inclusive end date (ISO `yyyy-MM-dd`) or "" for "no upper bound". */
  dateTo: string;
  /** Start-date change handler. */
  onDateFromChange: (date: string) => void;
  /** End-date change handler. */
  onDateToChange: (date: string) => void;
}

/**
 * History list filters: a model dropdown plus a from/to date window. Shown under
 * the search box; the Reset affordance clears all three at once.
 */
export function HistoryFilters({
  models,
  modelFilter,
  onModelFilterChange,
  modeFilter,
  onModeFilterChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: HistoryFiltersProps) {
  const hasAny = Boolean(modelFilter || modeFilter || dateFrom || dateTo);
  return (
    <div className="space-y-2 border-t border-chill-border pt-2 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-chill-muted font-medium">Filter</span>
        {hasAny && (
          <button
            type="button"
            onClick={() => {
              onModelFilterChange('');
              onModeFilterChange('');
              onDateFromChange('');
              onDateToChange('');
            }}
            className="text-xs text-chill-accent hover:text-chill-accent-hover active:text-chill-accent-active underline-offset-2 hover:underline active:underline min-h-[44px] px-1 font-medium rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            aria-label="Hapus semua filter"
          >
            Reset
          </button>
        )}
      </div>
      <label className="block relative">
        <span className="text-xs text-chill-muted font-medium">Model</span>
        <select
          value={modelFilter}
          onChange={(e) => onModelFilterChange(e.target.value)}
          className="w-full appearance-none pr-9 cursor-pointer bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm [color-scheme:dark]"
          aria-label="Filter model"
        >
          <option value="">Semua model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </label>
      <label className="block relative">
        <span className="text-xs text-chill-muted font-medium">Mode</span>
        <select
          value={modeFilter}
          onChange={(e) => onModeFilterChange(e.target.value)}
          className="w-full appearance-none pr-9 cursor-pointer bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm [color-scheme:dark]"
          aria-label="Filter mode"
        >
          <option value="">Semua mode</option>
          <option value="agent">Agent</option>
          <option value="direct">Direct</option>
        </select>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-chill-muted font-medium">Dari</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm [color-scheme:dark]"
            aria-label="Filter tanggal mulai"
          />
        </label>
        <label className="block">
          <span className="text-xs text-chill-muted font-medium">Sampai</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-full bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm [color-scheme:dark]"
            aria-label="Filter tanggal akhir"
          />
        </label>
      </div>
    </div>
  );
}
