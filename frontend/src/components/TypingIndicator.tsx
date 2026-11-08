import { useEffect, useState } from 'react';

export interface TypingIndicatorProps {
  /** Progress phase reported by the backend (e.g. "Berpikir…" or "Menyusun jawaban"). */
  status?: string;
  /** Label of the model currently processing the reply (shown while streaming). */
  modelLabel?: string;
}

/** Number of square blocks in the pixel loader. */
const SCAN_BLOCKS = 8;

/**
 * Pixel-art "assistant is busy" indicator with a phase-aware loader, optional
 * progress / model labels, and a live elapsed-time readout.
 *
 * The loader is a row of hard-edged squares. Two stepped animations cover the
 * two phases the backend reports:
 *  - `pixel-scan`: a single highlight sweeps left→right (composition / default)
 *  - `pixel-think`: a two-beat ripple (used while the model is still reasoning,
 *    i.e. the status contains "Berpikir")
 *
 * A one-second timer starts when the indicator mounts (which is exactly when a
 * fresh reply begins streaming) and ticks upward, so the reader sees how long
 * the current generation has been running. The elapsed readout is rendered
 * *outside* the `role="status"` live region and marked `aria-hidden`, so a
 * screen reader is not spammed with a new announcement every second.
 */
export function TypingIndicator({ status, modelLabel }: TypingIndicatorProps = {}) {
  const statusText = status || 'Menunggu respons';
  const label = modelLabel ? `${statusText} · ${modelLabel}` : statusText;
  const thinking = Boolean(status && status.includes('Berpikir'));
  const needsEllipsis = !status?.endsWith('…');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2 py-1">
      <span className="inline-flex items-center gap-2" role="status" aria-label={label}>
        <span className="inline-flex gap-[3px] items-center" aria-hidden="true">
          {Array.from({ length: SCAN_BLOCKS }, (_, i) => (
            <span
              key={i}
              className={`w-2 h-2 bg-chill-accent ${thinking ? 'pixel-think' : 'pixel-scan'}`}
              style={{ animationDelay: `${i * 125}ms` }}
            />
          ))}
        </span>
        {status && (
          <span className="text-xs text-chill-accent font-medium select-none pixel-blink">
            {status}{needsEllipsis ? '…' : ''}
          </span>
        )}
        {modelLabel && (
          <span className="text-xs text-chill-muted font-normal select-none">
            · {modelLabel}
          </span>
        )}
      </span>
      {elapsed >= 1 && (
        <span className="text-xs text-chill-muted font-normal select-none tabular-nums" aria-hidden="true">
          · {elapsed}s
        </span>
      )}
    </span>
  );
}
