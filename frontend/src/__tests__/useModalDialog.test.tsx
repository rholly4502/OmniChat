import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useModalDialog } from '../hooks/useModalDialog';

/**
 * Harness that mounts the hook against a real DOM panel so the focus-trap /
 * Escape / scroll-lock contract can be driven exactly as the dialogs use it.
 */
function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useModalDialog(open, onClose, '[data-close]');
  if (!open) return null;
  return (
    <div ref={panelRef}>
      <button data-close>Close</button>
      <button>Next</button>
    </div>
  );
}

beforeEach(() => {
  document.body.style.overflow = '';
  // Ensure a clean focus baseline.
  (document.activeElement as HTMLElement | null)?.blur?.();
});

afterEach(() => {
  document.body.style.overflow = '';
});

describe('useModalDialog', () => {
  it('locks body scroll while open and restores it on close', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Harness open={false} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('moves initial focus to the close control when opened', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    expect(document.activeElement?.hasAttribute('data-close')).toBe(true);
  });

  it('restores focus to the opener when the dialog closes', () => {
    const onClose = vi.fn();
    // Simulate a real opener button that has focus before the dialog opens.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Harness open onClose={onClose} />);
    expect(document.activeElement?.hasAttribute('data-close')).toBe(true);
    rerender(<Harness open={false} onClose={onClose} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab at the last focusable element', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // Focus the last element, then press Tab — focus should wrap to the first.
    const buttons = Array.from(document.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    act(() => {
      last.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    // The first button is the close control.
    expect(document.activeElement === buttons[0]).toBe(true);
  });

  it('traps Shift+Tab at the first focusable element', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const buttons = Array.from(document.querySelectorAll('button'));
    const first = buttons[0];
    act(() => {
      first.focus();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement === buttons[buttons.length - 1]).toBe(true);
  });

  it('removes the keydown listener and unlocks scroll on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness open onClose={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
    // A later Escape should no longer reach the handler.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
