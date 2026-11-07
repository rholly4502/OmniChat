import { useModalDialog } from '../hooks/useModalDialog';
import { estimateUsd, formatTokens, formatUsd, sortModelEntriesByCost } from '../tokenCost';
import { downloadBlob } from '../conversationExport';
import type { ConversationUsageSummary, ModelOption } from '../types';

/** Props accepted by {@link ChatStatsDialog}. */
export interface ChatStatsDialogProps {
  /** true renders the modal (zero-cost when false). */
  open: boolean;
  /** Request close (Escape, backdrop, close button). */
  onClose: () => void;
  /** Aggregate usage across every stored conversation (the server's usage summary). */
  usage: ConversationUsageSummary;
  /** Every known model (agent + direct) for id → label resolution. */
  modelOptions?: ModelOption[];
}

/** RFC 4180 quoting for a single CSV field. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Builds an RFC 4180 CSV of the global stats table: one row per model with its
 * prompt/completion/total tokens and estimated cost, then a Total row. Raw
 * numbers are used (not formatted strings) so a spreadsheet can sum them.
 */
function buildStatsCsv(usage: ConversationUsageSummary, modelOptions: ModelOption[] | undefined): string {
  const rows: string[][] = [['model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'biaya_usd']];
  const byModelEntries = sortModelEntriesByCost(Object.entries(usage.byModel));
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalTokens = 0;
  let totalUsd = 0;
  for (const [id, u] of byModelEntries) {
    totalPrompt += u.promptTokens;
    totalCompletion += u.completionTokens;
    totalTokens += u.totalTokens;
    const cost = estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, id);
    totalUsd += cost;
    const opt = modelOptions?.find((o) => o.id === id);
    rows.push([opt ? opt.label : id, String(u.promptTokens), String(u.completionTokens), String(u.totalTokens), cost.toFixed(6)]);
  }
  rows.push(['Total', String(usage.totalPromptTokens || totalPrompt), String(usage.totalCompletionTokens || totalCompletion), String(usage.totalTokens || totalTokens), totalUsd.toFixed(6)]);
  return '\uFEFF' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * Chat audit modal: an accessible, pixel-themed dialog that breaks the
 * conversation-wide usage summary into per-model rows with reasoning token and
 * cost columns, plus a feedback tally. Complement to the sidebar's collapsed
 * "Penggunaan" `<details>` — a real dialog with focus trap, Escape close and
 * body scroll lock, so the numbers are reviewable without scrolling a panel.
 */
export function ChatStatsDialog({ open, onClose, usage, modelOptions }: ChatStatsDialogProps) {
  const panelRef = useModalDialog(open, onClose, '[data-stats-close]');

  const byModelEntries = sortModelEntriesByCost(Object.entries(usage.byModel));
  const totalUsd = byModelEntries.reduce(
    (sum, [id, u]) => sum + estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, id),
    0,
  );
  const totalTokens = usage.totalTokens || byModelEntries.reduce((sum, [, u]) => sum + u.totalTokens, 0);

  const labelFor = (id: string): string => {
    const opt = modelOptions?.find((o) => o.id === id);
    return opt ? opt.label : id;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-chill-bg/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Statistik Chat"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-chill-surface border border-chill-border pixel-shadow p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-chill-text pixel-heading">Statistik Chat</h2>
          <button
            type="button"
            onClick={() =>
              downloadBlob(
                new Blob([buildStatsCsv(usage, modelOptions)], { type: 'text/csv;charset=utf-8' }),
                'statistik-chat.csv',
              )
            }
            aria-label="Ekspor statistik sebagai CSV"
            title="Ekspor statistik sebagai CSV"
            className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
          <button
            type="button"
            data-stats-close
            onClick={onClose}
            aria-label="Tutup statistik"
            className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-chill-elevated border border-chill-border p-2.5 space-y-0.5">
            <div className="text-xs text-chill-muted">Total token</div>
            <div className="text-sm text-chill-text font-semibold font-mono">{formatTokens(totalTokens)}</div>
          </div>
          <div className="bg-chill-elevated border border-chill-border p-2.5 space-y-0.5">
            <div className="text-xs text-chill-muted">Perkiraan biaya</div>
            <div className="text-sm text-chill-accent font-semibold font-mono">≈ {formatUsd(totalUsd)}</div>
          </div>
          <div className="bg-chill-elevated border border-chill-border p-2.5 space-y-0.5">
            <div className="text-xs text-chill-muted">Percakapan</div>
            <div className="text-sm text-chill-text font-semibold">{usage.conversationCount}</div>
          </div>
          <div className="bg-chill-elevated border border-chill-border p-2.5 space-y-0.5">
            <div className="text-xs text-chill-muted">Umpan balik</div>
            <div className="text-sm text-chill-text font-semibold flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                {usage.totalUpFeedback}
              </span>
              <span className="inline-flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                {usage.totalDownFeedback}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-chill-border pt-2">
          <div className="text-xs text-chill-muted font-medium mb-1.5">Rincian per model</div>
          {byModelEntries.length === 0 ? (
            <div className="text-xs text-chill-muted">Belum ada data penggunaan.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-chill-muted">
                  <th className="font-medium py-1 pr-2">Model</th>
                  <th className="font-medium py-1 pr-2 text-right">Input</th>
                  <th className="font-medium py-1 pr-2 text-right">Output</th>
                  <th className="font-medium py-1 pr-2 text-right">Total</th>
                  <th className="font-medium py-1 text-right">Biaya</th>
                </tr>
              </thead>
              <tbody>
                {byModelEntries.map(([id, u]) => {
                  const share = totalTokens > 0 ? Math.round((u.totalTokens / totalTokens) * 100) : 0;
                  return (
                    <tr key={id} className="border-t border-chill-border">
                      <td className="py-1.5 pr-2">
                        <div className="text-chill-text font-medium truncate max-w-[140px]" title={id}>{labelFor(id)}</div>
                        {share > 0 && <div className="text-chill-muted">{share}%</div>}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{formatTokens(u.promptTokens)}</td>
                      <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{formatTokens(u.completionTokens)}</td>
                      <td className="py-1.5 pr-2 text-right text-chill-text font-mono">{formatTokens(u.totalTokens)}</td>
                      <td className="py-1.5 text-right text-chill-accent font-mono">≈{formatUsd(estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, id))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
