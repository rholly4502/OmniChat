export interface TypingIndicatorProps {
  /** Progress phase reported by the backend (e.g. "Menyusun jawaban"). */
  status?: string;
}

/**
 * Three-dot "assistant is typing" indicator with optional progress status.
 *
 * The accessible announcement comes from the nested `role="status"` live region.
 */
export function TypingIndicator({ status }: TypingIndicatorProps = {}) {
  const label = status || 'Menunggu respons';
  return (
    <span className="inline-flex items-center gap-2 py-1" role="status" aria-label={label}>
      <span className="inline-flex gap-1 items-center">
        <span className="w-2.5 h-2.5 bg-chill-muted rounded-none pixel-blink" aria-hidden="true" />
        <span className="w-2.5 h-2.5 bg-chill-muted rounded-none pixel-blink [animation-delay:200ms]" aria-hidden="true" />
        <span className="w-2.5 h-2.5 bg-chill-muted rounded-none pixel-blink [animation-delay:400ms]" aria-hidden="true" />
      </span>
      {status && (
        <span className="text-xs text-chill-accent font-medium select-none pixel-blink">
          {status}…
        </span>
      )}
    </span>
  );
}
