/**
 * RhoWatermark — personal brand mark "RHO" (Greek letter ρ).
 * Style: Hermes-esque — geometric, monochrome, crisp pixel grid.
 * Used as a subtle professional footer across all project UIs.
 */
export default function RhoWatermark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-center gap-2 px-4 py-2 select-none',
        'text-xs',
      ].join(' ')}
    >
      {/* ρ glyph in a bordered tile */}
      <span
        className="inline-flex items-center justify-center border border-chill-border text-chill-accent"
        style={{ width: compact ? 18 : 22, height: compact ? 18 : 22, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
        aria-hidden="true"
      >
        ρ
      </span>
      <span className="tracking-[0.25em] font-medium text-chill-muted">
        RHO
      </span>
      <span className="text-chill-muted/60">·</span>
      <span className="text-chill-muted/60">Rholly Kurnia Putra</span>
    </div>
  );
}
