import { useCallback, useState } from 'react';

/** localStorage key for the auto-saved composer draft. */
export const COMPOSER_DRAFT_KEY = 'omnichat_composer_draft_v1';

/**
 * Auto-saves the composer draft to localStorage so a long, in-progress message
 * survives a reload or an accidental unmount, and restores it when the app
 * mounts again. Clearing the draft (or sending it) removes the stored entry
 * rather than persisting an empty string.
 *
 * Storage failures (private mode, quota) are swallowed: the draft simply does
 * not persist, which is never worse than today's behaviour.
 */
export function useComposerDraft() {
  const [draft, setDraftState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(COMPOSER_DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    try {
      if (value.trim()) {
        window.localStorage.setItem(COMPOSER_DRAFT_KEY, value);
      } else {
        window.localStorage.removeItem(COMPOSER_DRAFT_KEY);
      }
    } catch {
      /* storage unavailable — the draft just isn't persisted */
    }
  }, []);

  const clearDraft = useCallback(() => {
    setDraftState('');
    try {
      window.localStorage.removeItem(COMPOSER_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { draft, setDraft, clearDraft };
}
