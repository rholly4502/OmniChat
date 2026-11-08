import { useEffect, useRef, useState } from 'react';
import { EXPORT_FORMAT_LABELS, type ConversationExportFormat } from '../conversationExport';
import { BotIcon, BoltIcon, ChillIcon } from './Icons';
import { estimateUsd, formatTokens, formatUsd } from '../tokenCost';
import { CostDetailsPopover } from './CostDetailsPopover';
import { TypingIndicator } from './TypingIndicator';
import type { ModelOption, TokenUsage } from '../types';

export interface ChatHeaderProps {
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Active model id, used for the cost estimate. */
  model?: string;
  /** Human-readable label of the active model. */
  modelLabel?: string;
  /** Cumulative token usage for the active conversation (server base + live). */
  usage?: TokenUsage;
  /**
   * Estimated completion tokens streamed so far in the in-flight turn. When > 0
   * it is added to the live readout so the cost estimate ticks as the reply
   * streams, instead of only appearing when the turn's usage frame lands.
   */
  streamingEstimate?: number;
  /**
   * Catalog for the active mode, used to render a quick per-conversation model
   * switcher in the header. Optional: when omitted (or when no handler is given)
   * the model is shown as a static label instead of a select.
   */
  models?: ModelOption[];
  /** Per-conversation model change handler (persists for the active thread). */
  onModelChange?: (id: string) => void;
  /**
   * Copy the whole active-conversation transcript (Markdown) to the clipboard.
   * Optional; the button is hidden when no handler is given.
   */
  onCopyTranscript?: () => void;
  /** Opens the chat audit/stats dialog (desktop has no sidebar path to it). */
  onOpenStats?: () => void;
  /**
   * Opens the per-conversation audit dialog (message-level token/cost table for
   * the active thread). Optional; when omitted no audit button is rendered.
   */
  onOpenAudit?: () => void;
  /** Chill Mode active: show a subtle contraChill" pill beside the mode badge. */
  chillMode?: boolean;
  /**
   * Export the active conversation in the given format. Optional; the export
   * menu button is hidden when no handler is given.
   */
  onExport?: (format: ConversationExportFormat) => void;
  /**
   * Title of the active conversation. When present it is rendered as a truncated
   * label beside the mode badge so the current thread is identifiable at a glance
   * even with the sidebar collapsed. Optional.
   */
  title?: string;
  /**
   * Opens the keyboard-shortcut reference dialog. Optional; the button that
   * opens it is hidden when no handler is given.
   */
  onOpenShortcuts?: () => void;
  /**
   * true while an assistant reply is streaming, so the header shows a live
   * "thinking" indicator (phase + model + elapsed) at a glance, even when the
   * transcript is scrolled away from the typing indicator.
   */
  streaming?: boolean;
  /**
   * Progress phase reported by the backend for the in-flight reply (e.g.
   * "Berpikir…" / "Menyusun jawaban"). Only meaningful while `streaming` is true.
   */
  status?: string;
}

/**
 * Desktop chat header (`md` and up): shows the active mode, the model in use,
 * and the live cumulative token/cost estimate — the desktop counterpart of the
 * mobile top bar, so the current model is always visible while chatting (the
 * sidebar can be collapsed). Pure telemetry: no interactive controls.
 */
export function ChatHeader({ useAgent, model, modelLabel, usage, models, onModelChange, onOpenStats, onOpenAudit, chillMode, onCopyTranscript, onExport, onOpenShortcuts, title, streamingEstimate = 0, streaming = false, status }: ChatHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Close the export format menu when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setExportOpen(false);
        return;
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [exportOpen]);

  // Only render the inline model switcher when the active model is actually one
  // of the catalog options. When a conversation was last run on a model that is
  // not in the current catalog (e.g. the server's model list changed), a
  // controlled select whose value matches no option would render a misleading
  // selection — fall back to the static label instead.
  // When no model is selected yet (undefined) or the model is present in the
  // catalog, the switcher is safe to render. It is suppressed only when a
  // concrete model id is missing from the catalog (stale saved model).
  const modelInCatalog = !model || Boolean(models?.some((m) => m.id === model));

  const total = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) + streamingEstimate;
  const estimate = total > 0 && model ? formatUsd(estimateUsd({ promptTokens: usage?.promptTokens ?? 0, completionTokens: (usage?.completionTokens ?? 0) + streamingEstimate }, model)) : '';
  const tokenLabel = total > 0 ? `${formatTokens(total)} token` : '';
  return (
    <div className="chat-header-bar hidden md:flex items-center gap-3 px-4 py-2 border-b border-chill-border bg-chill-bg">
      <span className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text select-none">
        {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
        {useAgent ? 'Agent' : 'Direct'}
        {onModelChange && models && models.length > 0 && modelInCatalog ? (
          <span className="relative inline-flex items-center">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="Ganti model"
              className="appearance-none bg-transparent text-chill-accent text-base md:text-sm font-medium outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 cursor-pointer min-h-[44px] pl-1 pr-4 select-none [color-scheme:dark]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <svg width="10" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-chill-accent">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        ) : modelLabel ? (
          <span className="text-chill-accent font-medium">{modelLabel}</span>
        ) : null}
      </span>
      {chillMode && (
        <span
          className="inline-flex items-center gap-1 rounded-none border border-chill-border bg-chill-surface px-2 py-1 text-xs text-chill-accent font-medium select-none"
          aria-label="Chill Mode aktif"
        >
          <ChillIcon size={12} />
          Chill
        </span>
      )}
      {title && (
        <span
          className="truncate max-w-[34ch] text-sm text-chill-text font-medium select-none"
          title={title}
          aria-label={`Percakapan: ${title}`}
        >
          {title}
        </span>
      )}
      {/* The transcript's own typing indicator is the live region that announces
          to assistive tech; this header copy is a purely visual at-a-glance
          mirror, so it is aria-hidden to avoid a duplicate screen-reader
          announcement every second. */}
      {streaming && (
        <span aria-hidden="true" className="inline-flex items-center">
          <TypingIndicator status={status} modelLabel={modelLabel} />
        </span>
      )}
      <div className="ml-auto inline-flex items-center gap-2">
        {(tokenLabel || estimate) && (
          <span
            className="inline-flex items-center gap-1 text-xs text-chill-muted select-none"
            aria-label={`Penggunaan token: ${tokenLabel}${estimate ? `, perkiraan biaya ${estimate}` : ''}`}
          >
            <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span>
            {tokenLabel}
            {estimate ? ` · ≈${estimate}` : ''}
          </span>
        )}
        <CostDetailsPopover model={model} usage={usage} />
        {onCopyTranscript && (
          <button
            type="button"
            onClick={() => { setCopied(true); onCopyTranscript(); window.setTimeout(() => setCopied(false), 2000); }}
            aria-label={copied ? 'Percakapan tersalin' : 'Salin percakapan'}
            title={copied ? 'Percakapan tersalin' : 'Salin percakapan'}
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><rect x="9" y="9" width="13" height="13" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            )}
          </button>
        )}
        {onExport && (
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              aria-label="Ekspor percakapan"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title="Ekspor percakapan"
              className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            {exportOpen && (
              <div
                role="menu"
                aria-label="Format ekspor"
                className="absolute right-0 top-full z-30 mt-1 w-40 bg-chill-elevated border-2 border-chill-border pixel-shadow pixel-reveal"
              >
                {(Object.keys(EXPORT_FORMAT_LABELS) as ConversationExportFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    role="menuitem"
                    onClick={() => { setExportOpen(false); onExport(fmt); }}
                    className="rounded-none block w-full text-left px-3 min-h-[44px] text-sm text-chill-text hover:bg-chill-surface active:bg-chill-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  >
                    {EXPORT_FORMAT_LABELS[fmt]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onOpenAudit && (
          <button
            type="button"
            onClick={onOpenAudit}
            aria-label="Audit percakapan" 
            title="Audit percakapan"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
          </button>
        )}
        {onOpenStats && (
          <button
            type="button"
            onClick={onOpenStats}
            aria-label="Buka statistik chat"
            title="Statistik chat"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>
          </button>
        )}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Pintasan keyboard"
            title="Pintasan keyboard"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
