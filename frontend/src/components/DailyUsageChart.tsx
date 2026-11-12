import { formatTokens } from '../tokenCost';
import type { ConversationDayUsage } from '../types';

/** Props accepted by {@link DailyUsageChart}. */
export interface DailyUsageChartProps {
  /**
   * Per-day usage rows, oldest first (the server's `usage/daily` response).
   * Days with no activity are absent and render as a zero-height stub.
   */
  rows: ConversationDayUsage[];
  /** Human label for the range shown (e.g. "7 hari terakhir"). */
  rangeLabel?: string;
}

/**
 * Per-day token usage trend, rendered as a pixel bar chart. Each column is a
 * calendar day; the stacked bar splits output tokens (accent base) from input
 * tokens (lighter cap), so the reader sees both halves of the daily total at a
 * glance. This is the daily view of the aggregate chat usage summary — the
 * answer to "how much did I use on a given day".
 *
 * Styling follows the codebase's pixel register: hard-edged columns with a
 * top-left bevel, chill tokens only, and sparse tabular tick labels on the day
 * axis so the chart stays readable without hovering.
 */
export function DailyUsageChart({ rows, rangeLabel }: DailyUsageChartProps) {
  const data = rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const totalTokens = data.reduce((sum, r) => sum + r.totalTokens, 0);

  if (data.length === 0 || totalTokens === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-chill-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" className="w-4 h-4 shrink-0 text-chill-accent">
          <path d="M5 19v-5M12 19V9M19 19v-9" />
        </svg>
        <span>Belum ada penggunaan harian yang tercatat.</span>
      </div>
    );
  }

  // Build a dense column per day across the span [first, last] so a day with no
  // activity still renders as a zero-height tick, matching the month-grid feel
  // of the expenses chart.
  const first = data[0]!.date;
  const last = data[data.length - 1]!.date;
  const dayMap = new Map<string, ConversationDayUsage>();
  for (const r of data) dayMap.set(r.date, r);

  const columns: { date: string; day: string; prompt: number; completion: number; total: number }[] = [];
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  for (let t = new Date(start); t <= end; t.setUTCDate(t.getUTCDate() + 1)) {
    const iso = t.toISOString().slice(0, 10);
    const row = dayMap.get(iso);
    columns.push({
      date: iso,
      day: String(t.getUTCDate()),
      prompt: row?.promptTokens ?? 0,
      completion: row?.completionTokens ?? 0,
      total: row?.totalTokens ?? 0,
    });
  }

  const chartMax = Math.max(...columns.map((c) => c.total), 1);
  const activeDays = columns.filter((c) => c.total > 0).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-chill-muted tabular-nums">
        <span>
          {rangeLabel ? `${rangeLabel} · ` : ''}
          {activeDays} hari aktif · {formatTokens(totalTokens)} token
        </span>
        <span className="inline-flex items-center gap-2 select-none">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 bg-chill-accent border border-chill-accent/60 inline-block" aria-hidden="true" />
            keluaran
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 bg-chill-accent/40 border border-chill-accent/30 inline-block" aria-hidden="true" />
            masukan
          </span>
        </span>
      </div>
      <div role="img" aria-label="Penggunaan token per hari" className="relative h-40">
        <div className="absolute inset-0 flex items-end gap-px px-1">
          {columns.map((c) => {
            const completionH = c.total > 0 ? Math.max(3, Math.round((c.completion / chartMax) * 100)) : 0;
            const promptH = c.total > 0 ? Math.max(3, Math.round((c.prompt / chartMax) * 100)) : 0;
            return (
              <div key={c.date} data-testid={`usage-day-${c.date}`} className="flex-1 min-w-0 h-full flex items-end justify-center">
                {c.total > 0 ? (
                  <div
                    className="relative w-full max-w-[12px] md:max-w-[18px] flex flex-col"
                    style={{ height: `${Math.min(100, completionH + promptH)}%` }}
                    title={`${c.date}: ${formatTokens(c.total)} token (masukan ${formatTokens(c.prompt)} · keluaran ${formatTokens(c.completion)})`}
                  >
                    {/* Output tokens — accent base with hard top-left bevel. */}
                    <div className="w-full flex-1 bg-chill-accent border border-chill-accent/60" aria-hidden="true" />
                    {/* Input tokens — lighter cap on top. */}
                    <div className="w-full bg-chill-accent/40 border border-chill-accent/30" style={{ flexBasis: `${promptH}%`, flexGrow: 0 }} aria-hidden="true" />
                  </div>
                ) : (
                  <div className="w-full max-w-[12px] md:max-w-[18px] h-[3px] bg-chill-border/40" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" data-testid="usage-day-axis" className="mt-1 flex gap-px px-1 select-none">
        {columns.map((c, i) => {
          const show = i === 0 || i === columns.length - 1 || Number(c.day) % 5 === 0;
          return (
            <div key={c.date} className="flex-1 min-w-0 text-center">
              {show ? <span className="text-xs leading-none text-chill-muted/75 tabular-nums">{c.day}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
