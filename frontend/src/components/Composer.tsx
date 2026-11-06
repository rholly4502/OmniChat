import { useEffect, useRef } from 'react';
import { estimateTokens, estimateUsd, formatTokens, formatUsd } from '../tokenCost';

/** Props accepted by {@link Composer}. */
export interface ComposerProps {
  /** Current draft text. */
  input: string;
  /** Draft change handler. */
  onInputChange: (value: string) => void;
  /** true while a reply is streaming (disables input, swaps Send for Stop). */
  streaming: boolean;
  /** Submit the draft. */
  onSend: () => void;
  /** Abort the in-flight reply. */
  onStop: () => void;
  /** Active model id, used for the draft cost estimate (optional). */
  model?: string;
}

/**
 * Message composer: multi-line draft textarea with auto-resize, Send and Stop.
 *
 * Supports Enter to send and Shift+Enter for newline.
 * Preserves text-base md:text-sm to prevent iOS Safari auto-zoom on focus.
 *
 * When a `model` is supplied and the draft has content, a small live estimate
 * of the draft's token count and cost appears between the textarea and the
 * action row — the same rough estimator the header uses for streamed usage, so
 * the user can gauge message size/cost before sending.
 */
export function Composer({ input, onInputChange, streaming, onSend, onStop, model }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize height based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${Math.max(nextHeight, 44)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSend();
    }
  };

  // Live draft estimate: only meaningful when there is content and a model id
  // to price against. Reuses the same estimator as the streaming header readout.
  const trimmed = input.trim();
  const draftTokens = trimmed && model ? estimateTokens(trimmed) : 0;
  const draftCost = draftTokens > 0 && model
    ? estimateUsd({ promptTokens: draftTokens, completionTokens: 0 }, model)
    : 0;

  return (
    <div className="p-3 md:p-4 border-t-2 border-chill-border" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
      {draftTokens > 0 && (
        <div
          className="flex items-center justify-end gap-1 pb-1.5 text-xs text-chill-muted select-none"
          aria-live="polite"
          aria-label={`Perkiraan pesan: ${formatTokens(draftTokens)} token, perkiraan biaya ${formatUsd(draftCost)}`}
        >
          <span aria-hidden="true" className="inline-flex">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter">
              <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          ≈ {formatTokens(draftTokens)} tok · ≈{formatUsd(draftCost)}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Ketik pesan"
          value={input}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={streaming ? 'Menunggu respons…' : 'Ketik pesan…'}
          disabled={streaming}
          className="flex-1 bg-chill-surface border-2 border-chill-border rounded-none px-3.5 md:px-4 py-2.5 text-base md:text-sm outline-none placeholder:text-chill-muted focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/50 disabled:opacity-50 min-h-[44px] max-h-[180px] resize-none leading-relaxed transition-[border-color,box-shadow] pixel-shadow-sm"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="bg-chill-red text-chill-on-red hover:bg-chill-red-hover active:bg-chill-red-active active:translate-y-[3px] active:shadow-none rounded-none px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center gap-1.5 pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim()}
            className="bg-chill-accent text-chill-on-accent hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[3px] active:shadow-none disabled:opacity-40 rounded-none px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70"
          >
            Kirim
          </button>
        )}
      </div>
    </div>
  );
}
