import type { ApiStatus } from '../hooks/useApiHealth';

/** Human label per status, used as both the visible text and the aria-label. */
const LABELS: Record<ApiStatus, string> = {
  checking: 'Memeriksa koneksi…',
  online: 'Backend terhubung',
  offline: 'Backend tidak terjangkau',
};

/** Pixel theme dot colour per status (warm palette, hard-edged). */
const DOT_CLASS: Record<ApiStatus, string> = {
  checking: 'bg-chill-muted',
  online: 'bg-chill-sage',
  offline: 'bg-chill-red',
};

/**
 * Quiet backend-reachability note shown at the foot of the sidebar: a hard-edged
 * 8px square whose colour reflects {@link ApiStatus} plus a short caption.
 * Non-interactive telemetry — a plain labelled row, not a live region, so it
 * never competes with the typing indicator's `role="status"`.
 */
export function BackendStatus({ status }: { status: ApiStatus }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 select-none" aria-label={LABELS[status]}>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 ${DOT_CLASS[status]}`} />
      <span className="text-xs text-chill-muted">{LABELS[status]}</span>
    </div>
  );
}
