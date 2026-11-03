/**
 * Decorative pixel-frame texture for framed panels (9-slice register).
 * A hard top-light bevel, a warm corner pixel (top-right), and a dark chisel
 * pixel (bottom-left) —
 * the same sculpted-edge grammar as the StatCard meter, so every framed
 * surface (summary cards, trend panel, advice panel, entry form) speaks one
 * chunky edge language. Purely decorative: aria-hidden, pointer-events none.
 * Parent must be `relative overflow-hidden`.
 */
export function PanelFrame() {
  return (
    <>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-chill-elevated" />
      <div aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 bg-chill-accent/25" />
      <div aria-hidden="true" className="absolute left-0 bottom-0 h-2 w-2 bg-black/30" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-black/25" />
    </>
  );
}
