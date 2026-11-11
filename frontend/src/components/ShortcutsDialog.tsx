import { useModalDialog } from '../hooks/useModalDialog';

/** Props accepted by {@link ShortcutsDialog}. */
export interface ShortcutsDialogProps {
  /** true renders the modal (zero-cost when false). */
  open: boolean;
  /** Request close (Escape, backdrop, close button). */
  onClose: () => void;
}

/** One keyboard shortcut row: the keys and what they do. */
interface ShortcutRow {
  keys: string;
  action: string;
  adminOnly?: boolean;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: '/', action: 'Fokus kolom ketik' },
  { keys: 'Ctrl + K', action: 'Fokus kolom ketik' },
  { keys: 'Ctrl + Shift + F', action: 'Cari di percakapan saat ini' },
  { keys: 'Ctrl + N', action: 'Buka chat baru', adminOnly: true },
  { keys: 'Ctrl + Alt + C', action: 'Salin percakapan sebagai Markdown' },
  { keys: 'Alt + R', action: 'Coba lagi (regenerate jawaban terakhir)' },
  { keys: 'Enter', action: 'Kirim pesan' },
  { keys: 'Shift + Enter', action: 'Baris baru di kolom ketik' },
  { keys: 'Esc', action: 'Tutup dialog / sidebar' },
];

/**
 * Pixel-themed keyboard-shortcut reference dialog. The app binds several global
 * shortcuts (`/`, Ctrl+K, Ctrl+Shift+F, Ctrl+N) that are otherwise invisible;
 * this dialog surfaces them so a user discovering the app can learn them. It
 * shares the same modal accessibility contract as the stats/audit dialogs
 * (focus trap, Escape to close, body scroll-lock, initial focus on close).
 */
export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const panelRef = useModalDialog(open, onClose, '[data-shortcuts-close]');
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-chill-bg/60 pixel-overlay-fade"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pintasan keyboard"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-chill-surface border border-chill-border pixel-shadow p-4 space-y-3 pixel-reveal"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-chill-text pixel-heading">Pintasan keyboard</h2>
          <button
            type="button"
            data-shortcuts-close
            onClick={onClose}
            aria-label="Tutup pintasan"
            className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 min-h-[44px] px-2">
              <span className="text-sm text-chill-text">
                {s.action}
                {s.adminOnly ? <span className="text-xs text-chill-muted"> (admin)</span> : null}
              </span>
              <kbd
                className="rounded-none border border-chill-border bg-chill-elevated px-2 py-1 text-xs text-chill-accent font-medium whitespace-nowrap select-none"
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
