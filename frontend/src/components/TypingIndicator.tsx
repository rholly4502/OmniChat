/**
 * Three-dot "assistant is typing" indicator (frontend decomposition step 8).
 *
 * The dots are decorative. The accessible announcement comes from the nested
 * `role="status"` live region: the messages container carries
 * `aria-busy="true"` while streaming, which suppresses content-change
 * announcements inside it, so the indicator owns its own live region and is
 * announced independently.
 */
export function TypingIndicator() {
  return (
    <span className="inline-flex gap-1 items-center py-1" role="status" aria-label="Menunggu respons">
      <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse" aria-hidden="true" />
      <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:200ms]" aria-hidden="true" />
      <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:400ms]" aria-hidden="true" />
    </span>
  );
}
