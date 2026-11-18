import { useCallback, useEffect, useRef, useState } from 'react';

type Update<T> = T | ((prev: T) => T);

/**
 * Like `useState`, but initialised from — and written back to — `localStorage`
 * so a user's UI preference (e.g. the jobs pipeline filter, or which event
 * rows are hidden) survives a page reload.
 *
 * The stored value is JSON-encoded, so this works uniformly for strings,
 * numbers and booleans. The setter accepts the same functional updater form
 * as `useState` (e.g. `setHidden((v) => !v)`). When storage is unavailable
 * (private mode, disabled, SSR) or holds an unparseable value, it transparently
 * falls back to `fallback` and keeps working in-memory only.
 */
export function usePersistedState<T>(
  key: string,
  fallback: T,
): [T, (next: Update<T>) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  });

  // Keep the latest value addressable from the setter so functional updaters
  // (`(prev) => …`) read the current value without a stale closure. Synced
  // after every commit (refs must not be written during render).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const set = useCallback(
    (next: Update<T>) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next;
      setValue(resolved);
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* storage unavailable — keep the in-memory value only */
      }
    },
    [key],
  );

  return [value, set];
}
