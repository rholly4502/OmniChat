/**
 * Stepped pixel "working" loader: a row of hard-edged squares with a single
 * highlight sweeping left→right (the same `pixel-scan` animation as the chat
 * typing indicator). Purely decorative and `aria-hidden` — pair it with a
 * `role="status"` live region carrying the human-readable label (as the
 * full-page loaders in JobsView / ExpensesView do). Reduced-motion falls back
 * to the global `prefers-reduced-motion` media block in index.css, so the row
 * just settles on its static opacity when the user asks for less motion.
 */
export function ScanLoader({ blocks = 8 }: { blocks?: number } = {}) {
  return (
    <span className="inline-flex gap-[3px] items-center" aria-hidden="true">
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className="w-2 h-2 bg-chill-accent pixel-scan"
          style={{ animationDelay: `${i * 125}ms` }}
        />
      ))}
    </span>
  );
}
