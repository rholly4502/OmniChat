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
}

/**
 * Message composer: draft input, Send and Stop (frontend decomposition step 8).
 *
 * The draft state itself stays in App.tsx — this is presentational only. The
 * input keeps `text-base md:text-sm` so iOS Safari does not auto-zoom on focus
 * (16px on mobile, 14px from the `md` breakpoint up).
 */
export function Composer({ input, onInputChange, streaming, onSend, onStop }: ComposerProps) {
  return (
    <div className="p-3 md:p-4 border-t border-slate-800" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
      <div className="flex gap-2">
        <input
          aria-label="Ketik pesan"
          value={input}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={streaming ? 'Menunggu respons…' : 'Ketik pesan…'}
          disabled={streaming}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 md:px-4 py-3 text-base md:text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-50 min-h-[44px]"
        />
        {streaming ? (
          <button
            onClick={onStop}
            className="bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-40 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Kirim
          </button>
        )}
      </div>
    </div>
  );
}
