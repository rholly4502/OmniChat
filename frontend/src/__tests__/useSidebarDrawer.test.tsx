import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useSidebarDrawer } from '../hooks/useSidebarDrawer';

/**
 * Unit tests for the extracted mobile drawer hook (frontend decomposition
 * step 7). These pin the behaviour the inline effects/handlers had in App.tsx:
 * Escape + focus trap, body scroll lock, focus restoration, and the edge-swipe
 * open / leftward-swipe close gestures.
 *
 * jsdom reports `offsetWidth` as 0 on every element, so the harness pins the
 * drawer width explicitly — the swipe threshold is a fraction of it.
 */

const DRAWER_WIDTH = 300;

function Harness({ onResult }: { onResult: (r: ReturnType<typeof useSidebarDrawer>) => void }) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const openFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const result = useSidebarDrawer({ sidebarRef, openFocusRef, restoreFocusRef });
  onResult(result);

  return (
    <div>
      <button
        ref={restoreFocusRef as React.RefObject<HTMLButtonElement>}
        onClick={result.openDrawer}
      >
        Open menu
      </button>
      <aside
        ref={sidebarRef as React.RefObject<HTMLElement>}
        role={result.open ? 'dialog' : undefined}
      >
        <button
          ref={openFocusRef as React.RefObject<HTMLButtonElement>}
          onClick={result.closeDrawer}
        >
          Close sidebar
        </button>
        <input aria-label="Model" />
        <button>Clear chat</button>
      </aside>
    </div>
  );
}

/** Renders the harness and returns a live handle on the hook result. */
function setup() {
  const box: { current: ReturnType<typeof useSidebarDrawer> | null } = { current: null };
  const utils = render(<Harness onResult={(r) => { box.current = r; }} />);
  const aside = utils.container.querySelector('aside') as HTMLElement;
  Object.defineProperty(aside, 'offsetWidth', { value: DRAWER_WIDTH, configurable: true });
  const result = () => {
    if (!box.current) throw new Error('hook not rendered');
    return box.current;
  };
  return { ...utils, aside, result };
}

/** Minimal React TouchEvent stand-in: the hook reads only `touches[0]`. */
function touchAt(x: number, y = 0) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as React.TouchEvent;
}

describe('useSidebarDrawer', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });

  it('starts closed', () => {
    const { result } = setup();
    expect(result().open).toBe(false);
  });

  it('openDrawer opens and closeDrawer closes', () => {
    const { result } = setup();
    act(() => result().openDrawer());
    expect(result().open).toBe(true);
    act(() => result().closeDrawer());
    expect(result().open).toBe(false);
  });

  it('locks body scroll while open and restores it on close', () => {
    const { result } = setup();
    expect(document.body.style.overflow).toBe('');

    act(() => result().openDrawer());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => result().closeDrawer());
    expect(document.body.style.overflow).toBe('');
  });

  it('moves focus to the drawer on open and back to the trigger on close', () => {
    const { result } = setup();
    const closeBtn = document.activeElement;

    act(() => result().openDrawer());
    expect((document.activeElement as HTMLElement).textContent).toBe('Close sidebar');

    act(() => result().closeDrawer());
    expect((document.activeElement as HTMLElement).textContent).toBe('Open menu');
    expect(document.activeElement).not.toBe(closeBtn);
  });

  it('closes on Escape while open', () => {
    const { result } = setup();
    act(() => result().openDrawer());
    expect(result().open).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result().open).toBe(false);
  });

  it('does not listen for Escape while closed', () => {
    const { result } = setup();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result().open).toBe(false);
  });

  it('traps Tab from the last focusable element back to the first', () => {
    const { result } = setup();
    act(() => result().openDrawer());

    const aside = document.querySelector('aside') as HTMLElement;
    const focusable = aside.querySelectorAll<HTMLElement>('button, input');
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('ignores a touch that starts away from the left edge while closed', () => {
    const { result, aside } = setup();
    act(() => result().onTouchStart(touchAt(150)));
    act(() => result().onTouchMove(touchAt(260)));
    act(() => result().onTouchEnd());

    expect(result().open).toBe(false);
    expect(aside.style.transform).toBe('');
  });

  it('opens on an edge swipe past the threshold', () => {
    const { result } = setup();
    act(() => result().onTouchStart(touchAt(5)));
    // Threshold is 30% of 300px = 90px; move 120px to the right.
    act(() => result().onTouchMove(touchAt(125)));
    act(() => result().onTouchEnd());

    expect(result().open).toBe(true);
  });

  it('does not open when the edge swipe stops short of the threshold', () => {
    const { result } = setup();
    act(() => result().onTouchStart(touchAt(5)));
    act(() => result().onTouchMove(touchAt(65)));
    act(() => result().onTouchEnd());

    expect(result().open).toBe(false);
  });

  it('follows the finger with inline transform during an open swipe', () => {
    const { result, aside } = setup();
    act(() => result().onTouchStart(touchAt(5)));
    act(() => result().onTouchMove(touchAt(85)));

    // Closed drawer sits at -300; +80px of travel → -220px.
    expect(aside.style.transform).toBe('translateX(-220px)');
    expect(aside.style.transition).toBe('none');
  });

  it('clears inline styles on release so the CSS transition takes over', () => {
    const { result, aside } = setup();
    act(() => result().onTouchStart(touchAt(5)));
    act(() => result().onTouchMove(touchAt(85)));
    act(() => result().onTouchEnd());

    expect(aside.style.transform).toBe('');
    expect(aside.style.transition).toBe('');
  });

  it('closes on a leftward swipe when open', () => {
    const { result } = setup();
    act(() => result().openDrawer());

    act(() => result().onTouchStart(touchAt(200)));
    act(() => result().onTouchMove(touchAt(80)));
    act(() => result().onTouchEnd());

    expect(result().open).toBe(false);
  });

  it('stays open on a short leftward swipe', () => {
    const { result } = setup();
    act(() => result().openDrawer());

    act(() => result().onTouchStart(touchAt(200)));
    act(() => result().onTouchMove(touchAt(160)));
    act(() => result().onTouchEnd());

    expect(result().open).toBe(true);
  });

  it('rejects a primarily-vertical gesture so page scrolling wins', () => {
    const { result, aside } = setup();
    act(() => result().onTouchStart(touchAt(5)));
    // dx = 120 (past threshold) but dy = 200 dominates → ignored.
    act(() => result().onTouchMove(touchAt(125, 200)));

    expect(aside.style.transform).toBe('');

    act(() => result().onTouchEnd());
    expect(result().open).toBe(false);
  });

  it('ignores a touchmove with no preceding touchstart', () => {
    const { result, aside } = setup();
    act(() => result().onTouchMove(touchAt(200)));
    expect(aside.style.transform).toBe('');
  });

  it('does not crash when the touch list is empty', () => {
    const { result } = setup();
    const empty = { touches: [] } as unknown as React.TouchEvent;
    act(() => result().onTouchStart(empty));
    act(() => result().onTouchMove(empty));
    act(() => result().onTouchEnd());
    expect(result().open).toBe(false);
  });

  it('closes when the backdrop is clicked (wired in App via closeDrawer)', () => {
    const { result } = setup();
    act(() => result().openDrawer());
    expect(result().open).toBe(true);
    act(() => result().closeDrawer());
    expect(result().open).toBe(false);
  });

  it('wires through real clicks on the open and close controls', () => {
    const { result, getByText } = setup();

    fireEvent.click(getByText('Open menu'));
    expect(result().open).toBe(true);

    fireEvent.click(getByText('Close sidebar'));
    expect(result().open).toBe(false);
  });
});
