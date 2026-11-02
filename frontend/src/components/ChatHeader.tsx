import { BotIcon, BoltIcon } from './Icons';
import { estimateUsd, formatTokens, formatUsd } from '../tokenCost';
import type { TokenUsage } from '../types';

export interface ChatHeaderProps {
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Active model id, used for the cost estimate. */
  model?: string;
  /** Human-readable label of the active model. */
  modelLabel?: string;
  /** Cumulative token usage for the active conversation (server base + live). */
  usage?: TokenUsage;
}

/**
 * Desktop chat header (`md` and up): shows the active mode, the model in use,
 * and the live cumulative token/cost estimate — the desktop counterpart of the
 * mobile top bar, so the current model is always visible while chatting (the
 * sidebar can be collapsed). Pure telemetry: no interactive controls.
 */
export function ChatHeader({ useAgent, model, modelLabel, usage }: ChatHeaderProps) {
  const total = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
  const estimate = total > 0 && model ? formatUsd(estimateUsd(usage!, model)) : '';
  const tokenLabel = total > 0 ? `${formatTokens(total)} token` : '';
  return (
    <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-chill-border bg-chill-bg">
      <span className="inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text select-none">
        {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
        {useAgent ? 'Agent' : 'Direct'}
        {modelLabel ? <span className="text-chill-accent font-medium">{modelLabel}</span> : null}
      </span>
      {(tokenLabel || estimate) && (
        <span
          className="inline-flex items-center gap-1 ml-auto text-xs text-chill-muted select-none"
          aria-label={`Penggunaan token: ${tokenLabel}${estimate ? `, perkiraan biaya ${estimate}` : ''}`}
        >
          <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span>
          {tokenLabel}
          {estimate ? ` · ≈${estimate}` : ''}
        </span>
      )}
    </div>
  );
}
