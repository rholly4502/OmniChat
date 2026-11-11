import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared modal behavior for the pixel-themed chat dialogs.
 *
 * Both ChatStatsDialog and ConversationAuditDialog previously duplicated the
 * same ~35 lines of accessibility plumbing: body scroll-lock while open,
 * initial focus on a designated close control, Escape to close, and a Tab
 * focus trap that keeps keyboard navigation inside the panel. Extracting it
 * into one tested hook keeps that accessibility contract in a single place.
 *
 * @param open - true renders the modal; the effect is a no-op when false.
 * @param onClose - requested close (Escape, backdrop, close button).
 * @param closeSelector - CSS selector for the button that receives initial focus
 *   (the dialog's close control), e.g. `'[data-stats-close]'`.
 * @returns A ref to attach to the dialog panel element.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
  closeSelector: string,
): RefObject<HTMLDivElement | null> {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Remember what had focus before the dialog took it, so we can return it on
    // close (ARIA dialog pattern / WCAG 2.4.3 Focus Order). The opener button is
    // still focused here because the close control is focused below, after we
    // capture it.
    const prevActive = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>(closeSelector)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Return focus to whatever opened the dialog (ARIA dialog pattern /
      // WCAG 2.4.3). Only restore if the element is still in the document — the
      // opener may have been removed (e.g. the view switched) while the dialog
      // was open, in which case focusing a detached node is a no-op.
      if (prevActive?.isConnected) {
        prevActive.focus();
      }
    };
  }, [open, onClose, closeSelector]);

  return panelRef;
}
