import { useEffect, useRef, useState } from 'react';
import { formatUsd, getModelRate } from '../tokenCost';
import type { TokenUsage } from '../types';

interface CostDetailsPopoverProps {
  /** Active model id; when absent the component renders nothing. */
  model?: string;
  /** Cumulative token usage for the active conversation (server base + live). */
  usage?: TokenUsage;
}

/** Human label for each rate provenance. */
const SOURCE_LABEL = {
  known: 'Tarif dari tabel model',
  fallback: 'Tarif konservatif untuk model tak dikenal',
  free: 'Tier gratis (OpenRouter :free)',
} as const;

/**
 * Pixel-theme disclosure that explains how the header cost estimate is derived:
 * the per-1K-token input/output rates for the active model and their source
 * (table / fallback / free). The header readout is deliberately an "≈"
 * estimate, so this makes the arithmetic auditable instead of a magic number.
 * Desktop-first: it lives next to the full cost telemetry in the chat header.
 */
export function CostDetailsPopover({ model, usage }: CostDetailsPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or when clicking outside (same pattern as the export menu).
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!model) return null;

  const rate = getModelRate(model);
  const sessionCost =
    usage && (usage.promptTokens > 0 || usage.completionTokens > 0)
      ? formatUsd((usage.promptTokens / 1000) * rate.input + (usage.completionTokens / 1000) * rate.output)
      : null;

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Perincian perkiraan biaya"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Perincian biaya"
        className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Perincian perkiraan biaya"
          className="absolute right-0 top-full z-30 mt-1 w-72 bg-chill-elevated border-2 border-chill-border pixel-shadow p-3 pixel-reveal"
        >
          <p className="text-xs text-chill-muted">
            Perkiraan biaya untuk <span className="text-chill-accent font-medium">{model}</span>
          </p>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-chill-muted">Input</dt>
              <dd className="text-chill-text">${rate.input.toFixed(4)} / 1K token</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-chill-muted">Output</dt>
              <dd className="text-chill-text">${rate.output.toFixed(4)} / 1K token</dd>
            </div>
            {sessionCost && (
              <div className="flex justify-between gap-2 pt-1 border-t border-chill-border">
                <dt className="text-chill-muted">Terpakai sesi ini</dt>
                <dd className="text-chill-accent font-medium">{sessionCost}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-xs text-chill-muted">
            {SOURCE_LABEL[rate.source]}. Estimasi dengan tarif list harga provider; tagihan aktual dapat berbeda.
          </p>
        </div>
      )}
    </div>
  );
}
