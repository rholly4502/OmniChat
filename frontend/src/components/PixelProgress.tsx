/**
 * Pixel-art segmented progress bar: discrete square blocks with hard gaps,
 * instead of a smooth continuous fill — the retro resource-bar register
 * (research: pixel/HUD resource bars read as chunky blocks, zero radius).
 * Accessible: purely decorative (aria-hidden), value is also narrated as
 * text elsewhere in the surrounding UI.
 */
export function PixelProgress({
  percent,
  tone = 'accent',
  segments = 10,
}: {
  percent: number;
  tone?: 'accent' | 'red';
  segments?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * segments);
  const fillClass = tone === 'red' ? 'bg-chill-red' : 'bg-chill-accent';
  return (
    <div
      aria-hidden="true"
      className="flex h-2 w-full items-stretch gap-[3px] rounded-none border border-chill-border bg-chill-surface px-[2px]"
    >
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} className={`relative h-full flex-1 overflow-hidden ${i < filled ? fillClass : 'bg-chill-border/30'}`}>
          {/* Lit top row on filled cells (resource-bar depth): a faint warm
              highlight along the top edge, matching the includevel register —
              decorative only, aria-hidden is inherited from the track. */}
          {i < filled && <div className="absolute inset-x-0 top-0 h-[2px] bg-white/15" />}
        </div>
      ))}
    </div>
  );
}
