import { BotIcon, BoltIcon } from './Icons';
import { estimateUsd, formatTokens, formatUsd } from '../tokenCost';
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
   * Catalog for the active mode, used to render a quick per-conversation model
   * switcher in the header. Optional: when omitted (or when no handler is given)
   * the model is shown as a static label instead of a select.
   */
  models?: ModelOption[];
  /** Per-conversation model change handler (persists for the active thread). */
  onModelChange?: (id: string) => void;
  /** Opens the chat audit/stats dialog (desktop has no sidebar path to it). */
  onOpenStats?: () => void;
}

/**
 * Desktop chat header (`md` and up): shows the active mode, the model in use,
 * and the live cumulative token/cost estimate — the desktop counterpart of the
 * mobile top bar, so the current model is always visible while chatting (the
 * sidebar can be collapsed). Pure telemetry: no interactive controls.
 */
export function ChatHeader({ useAgent, model, modelLabel, usage, models, onModelChange, onOpenStats }: ChatHeaderProps) {
  const total = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
  const estimate = total > 0 && model ? formatUsd(estimateUsd(usage!, model)) : '';
  const tokenLabel = total > 0 ? `${formatTokens(total)} token` : '';
  return (
    <div className="chat-header-bar hidden md:flex items-center gap-3 px-4 py-2 border-b border-chill-border bg-chill-bg">
      <span className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text select-none">
        {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
        {useAgent ? 'Agent' : 'Direct'}
        {onModelChange && models && models.length > 0 ? (
          <span className="relative inline-flex items-center">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="Ganti model"
              className="appearance-none bg-transparent text-chill-accent text-base md:text-sm font-medium outline-none cursor-pointer min-h-[44px] pl-1 pr-4 select-none"
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
        {onOpenStats && (
          <button
            type="button"
            onClick={onOpenStats}
            aria-label="Buka statistik chat"
            title="Statistik chat"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
