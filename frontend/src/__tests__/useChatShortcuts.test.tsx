import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatShortcuts } from '../hooks/useChatShortcuts';

function fireKey(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('useChatShortcuts', () => {
  let composer: () => void;
  let open: () => void;
  let news: () => void;
  let copy: () => void;

  beforeEach(() => {
    composer = vi.fn();
    open = vi.fn();
    news = vi.fn();
    copy = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // clean any stray dialogs left in the DOM
    document.body.innerHTML = '';
  });

  it('focuses composer on "/"', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    fireKey({ key: '/' });
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('focuses composer on Ctrl+K', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    fireKey({ key: 'k', ctrlKey: true });
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('opens search on Ctrl+Shift+F', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    fireKey({ key: 'F', ctrlKey: true, shiftKey: true });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('starts a new session on Ctrl+N', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    fireKey({ key: 'n', ctrlKey: true });
    expect(news).toHaveBeenCalledTimes(1);
  });

  it('copies the transcript on Ctrl+Alt+C', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news, onCopyTranscript: copy }));
    fireKey({ key: 'c', ctrlKey: true, altKey: true });
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('does not copy plain C, Ctrl+C, or Ctrl+Shift+C', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news, onCopyTranscript: copy }));
    fireKey({ key: 'c' });
    fireKey({ key: 'c', ctrlKey: true });
    fireKey({ key: 'c', ctrlKey: true, shiftKey: true });
    expect(copy).not.toHaveBeenCalled();
  });

  it('does not fire when typing in an input (target guard)', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
    expect(composer).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
  });

  it('does not fire while a dialog is open', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news, onCopyTranscript: copy }));
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    fireKey({ key: '/' });
    expect(composer).not.toHaveBeenCalled();
    fireKey({ key: 'n', ctrlKey: true });
    expect(news).not.toHaveBeenCalled();
    fireKey({ key: 'c', ctrlKey: true, altKey: true });
    expect(copy).not.toHaveBeenCalled();
  });

  it('ignores plain keys and non-matching shortcuts', () => {
    renderHook(() => useChatShortcuts({ onFocusComposer: composer, onOpenSearch: open, onNewSession: news }));
    fireKey({ key: 'a' });
    fireKey({ key: 'f', ctrlKey: true, shiftKey: false });
    expect(composer).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(news).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });
});
