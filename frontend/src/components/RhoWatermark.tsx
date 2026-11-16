/**
 * RhoWatermark — personal brand mark "RHO" (Greek letter ρ).
 * Style: Hermes-esque — geometric, monochrome, crisp pixel grid.
 * Used as a subtle professional footer across all project UIs.
 */
export default function RhoWatermark({ compact = false, floating = false }: { compact?: boolean; floating?: boolean }) {
  // Mode floating: overlay kecil di pojok kanan-bawah (tidak mendorong layout,
  // pointer-events-none supaya tidak menghalangi klik konten di bawahnya).
  if (floating) {
    return (
      <div
        title="Rholly Kurnia Putra"
        className="pointer-events-none absolute right-2 bottom-2 z-[40] flex items-center gap-1.5 select-none text-[10px]"
      >
        <span
          className="inline-flex items-center justify-center border border-chill-border text-chill-accent"
          style={{ width: 14, height: 14, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
          aria-hidden="true"
        >
          ρ
        </span>
        <span className="tracking-[0.25em] font-medium text-chill-muted/70">
          RHO
        </span>
      </div>
    );
  }
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
