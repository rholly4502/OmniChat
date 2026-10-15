import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from 'react';

/** Width in px of the left-edge hot zone that starts an open-swipe. */
const EDGE_ZONE_PX = 20;

/** Fraction of the drawer width a release must cross to flip open/closed. */
const SWIPE_FRACTION = 0.3;

/** Options accepted by {@link useSidebarDrawer}. */
export interface UseSidebarDrawerOptions {
  /** The drawer element. Transformed during a swipe, measured for its width. */
  sidebarRef: RefObject<HTMLElement | null>;
  /** Receives focus when the drawer opens (the close button). */
  openFocusRef: RefObject<HTMLElement | null>;
  /** Receives focus back when the drawer closes (the hamburger button). */
  restoreFocusRef: RefObject<HTMLElement | null>;
}

/** Drawer state plus the handlers App.tsx wires onto the layout elements. */
export interface UseSidebarDrawerResult {
  /** true while the mobile drawer is on screen. */
  open: boolean;
  /** Open the drawer. */
  openDrawer: () => void;
  /** Close the drawer. */
  closeDrawer: () => void;
  /** Attach to `onTouchStart` on the root element. */
  onTouchStart: (e: ReactTouchEvent) => void;
  /** Attach to `onTouchMove` on the root element. */
  onTouchMove: (e: ReactTouchEvent) => void;
  /** Attach to `onTouchEnd` / `onTouchCancel` on the root element. */
  onTouchEnd: () => void;
}

/**
 * Owns the mobile sidebar drawer: open state, Escape/focus-trap keyboard
 * handling, body scroll lock, focus restoration and edge-swipe gestures
 * (frontend decomposition step 7).
 *
 * Behaviour is unchanged from the three inline effects and three touch
 * handlers it replaces in App.tsx:
 *  - Escape closes; Tab is trapped between the first and last focusable
 *    element inside the drawer while it is open
 *  - `document.body.style.overflow` is locked while open and restored on close
 *  - focus moves to the close button on open and back to the menu button on
 *    close (WCAG dialog pattern)
 *  - a touch starting within {@link EDGE_ZONE_PX} of the left edge opens the
 *    drawer; a leftward drag of more than {@link SWIPE_FRACTION} of the width
 *    closes it; a primarily-vertical gesture is ignored so page scrolling wins
 *  - while dragging, the element is transformed with `transition: none`; on
 *    release the inline styles are cleared so the CSS transition and Tailwind
 *    classes animate it to the final position
 */
export function useSidebarDrawer(
  options: UseSidebarDrawerOptions
): UseSidebarDrawerResult {
  const { sidebarRef, openFocusRef, restoreFocusRef } = options;

  const [open, setOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchDelta = useRef(0);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  // Escape to close + focus trap while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'Tab' && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sidebarRef]);

  // Body scroll lock + focus management for the mobile drawer.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    openFocusRef.current?.focus();
    const restoreTarget = restoreFocusRef.current;
    return () => {
      document.body.style.overflow = '';
      restoreTarget?.focus();
    };
  }, [open, openFocusRef, restoreFocusRef]);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (!open && touch.clientX <= EDGE_ZONE_PX) {
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      } else if (open) {
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }
    },
    [open]
  );

  const resetInlineStyles = useCallback(() => {
    const sb = sidebarRef.current;
    if (sb) {
      sb.style.transform = '';
      sb.style.transition = '';
    }
  }, [sidebarRef]);

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      // Primarily vertical: the user is scrolling, not swiping.
      if (Math.abs(dy) > Math.abs(dx)) {
        if (touchDelta.current !== 0) {
          resetInlineStyles();
          touchDelta.current = 0;
        }
        return;
      }

      touchDelta.current = dx;
      const sb = sidebarRef.current;
      if (!sb) return;
      const width = sb.offsetWidth;
      // Closed: drawer sits at -width, moving toward 0.
      // Open:   drawer sits at 0, moving toward -width.
      const translate = open
        ? Math.max(-width, Math.min(dx, 0))
        : Math.max(-width, Math.min(dx - width, 0));
      sb.style.transform = `translateX(${translate}px)`;
      sb.style.transition = 'none';
    },
    [open, resetInlineStyles, sidebarRef]
  );

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current) return;
    touchStart.current = null;
    const sb = sidebarRef.current;
    if (!sb) {
      touchDelta.current = 0;
      return;
    }
    const threshold = sb.offsetWidth * SWIPE_FRACTION;
    // Clear inline styles so the CSS transition takes over.
    resetInlineStyles();
    if (!open && touchDelta.current > threshold) {
      setOpen(true);
    } else if (open && touchDelta.current < -threshold) {
      setOpen(false);
    }
    touchDelta.current = 0;
  }, [open, resetInlineStyles, sidebarRef]);

  return { open, openDrawer, closeDrawer, onTouchStart, onTouchMove, onTouchEnd };
}
