import { useEffect } from 'react';

/** Callbacks fired by the global chat keyboard shortcuts. */
export interface ChatShortcutOptions {
  /** Focus the composer textarea. */
  onFocusComposer?: () => void;
  /** Open the in-transcript search toolbar. */
  onOpenSearch?: () => void;
  /** Start a new chat (admin only — guests have no sessions). */
  onNewSession?: () => void;
}

/**
 * True when the event originated from an editable field, so a shortcut must
 * never fire — the user could be typing the very character the shortcut binds
 * (e.g. `/` in a search box).
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True while any `role="dialog"` is in the DOM (drawer open, stats/audit modal). */
function isModalOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"]'));
}

/**
 * Global keyboard shortcuts for the chat workspace:
 *
 *  - `/` or `Ctrl+K`  → focus the composer
 *  - `Ctrl+Shift+F`    → open the in-transcript search toolbar
 *  - `Ctrl+N`          → start a new chat (admin only)
 *
 * Every shortcut is guarded: it is ignored while the user is typing in an
 * input/textarea/select, and while any dialog is open (so it never hijacks
 * keystrokes meant for the modal, drawer or export menu). The effect re-binds
 * on every render from the latest callbacks, so it always calls the current
 * handlers.
 */
export function useChatShortcuts(options: ChatShortcutOptions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (isModalOpen()) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        options.onOpenSearch?.();
        return;
      }
      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault();
        options.onFocusComposer?.();
        return;
      }
      if (!mod && e.key === '/') {
        e.preventDefault();
        options.onFocusComposer?.();
        return;
      }
      if (mod && !e.shiftKey && key === 'n') {
        e.preventDefault();
        options.onNewSession?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options]);
}
