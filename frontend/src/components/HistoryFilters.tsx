import type { ModelOption } from '../types';

/** Props accepted by {@link HistoryFilters}. */
export interface HistoryFiltersProps {
  /** Model choices for the dropdown (usually the active mode's catalog). */
  models: ModelOption[];
  /** Selected model filter; empty string means "all models". */
  modelFilter: string;
  /** Model filter change handler ("" resets). */
  onModelFilterChange: (model: string) => void;
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
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: HistoryFiltersProps) {
  const hasAny = Boolean(modelFilter || dateFrom || dateTo);
  return (
    <div className="space-y-2 border-t border-chill-border pt-2 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-chill-muted font-medium">Filter</span>
        {hasAny && (
          <button
            type="button"
            onClick={() => {
              onModelFilterChange('');
              onDateFromChange('');
              onDateToChange('');
            }}
            className="text-xs text-chill-accent hover:text-chill-accent-hover underline-offset-2 hover:underline min-h-[44px] px-1 font-medium"
            aria-label="Hapus semua filter"
          >
            Reset
          </button>
        )}
      </div>
      <label className="block">
        <span className="text-xs text-chill-muted font-medium">Model</span>
        <select
          value={modelFilter}
          onChange={(e) => onModelFilterChange(e.target.value)}
          className="w-full bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm"
          aria-label="Filter model"
        >
          <option value="">Semua model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-chill-muted font-medium">Dari</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm"
            aria-label="Filter tanggal mulai"
          />
        </label>
        <label className="block">
          <span className="text-xs text-chill-muted font-medium">Sampai</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-full bg-chill-surface border border-chill-border px-2 py-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm"
            aria-label="Filter tanggal akhir"
          />
        </label>
      </div>
    </div>
  );
}
