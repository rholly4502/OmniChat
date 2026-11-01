export interface TypingIndicatorProps {
  /** Progress phase reported by the backend (e.g. "Menyusun jawaban"). */
  status?: string;
  /** Label of the model currently processing the reply (shown while streaming). */
  modelLabel?: string;
}

/** Number of square blocks in the pixel scan loader. */
const SCAN_BLOCKS = 8;

/**
 * Pixel-art "assistant is busy" indicator with a scanning loader and optional
 * progress / model labels.
 *
 * The loader is a row of hard-edged squares through which a single highlight
 * sweeps left→right (stepped keyframes, no tweening). It is decorative and
 * `aria-hidden`; the nested `role="status"` live region carries the text.
 */
export function TypingIndicator({ status, modelLabel }: TypingIndicatorProps = {}) {
  const statusText = status || 'Menunggu respons';
  const label = modelLabel ? `${statusText} · ${modelLabel}` : statusText;
  return (
    <span className="inline-flex items-center gap-2 py-1" role="status" aria-label={label}>
      <span className="inline-flex gap-[3px] items-center" aria-hidden="true">
        {Array.from({ length: SCAN_BLOCKS }, (_, i) => (
          <span
            key={i}
            className="w-2 h-2 bg-chill-accent pixel-scan"
            style={{ animationDelay: `${i * 125}ms` }}
          />
        ))}
      </span>
      {status && (
        <span className="text-xs text-chill-accent font-medium select-none pixel-blink">
          {status}…
        </span>
      )}
      {modelLabel && (
        <span className="text-xs text-chill-muted font-normal select-none">
          · {modelLabel}
        </span>
      )}
    </span>
  );
}
