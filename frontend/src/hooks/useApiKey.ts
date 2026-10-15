import { useEffect, useState } from 'react';
import { API_KEY_STORAGE } from '../constants';

/**
 * API key state persisted to localStorage (frontend decomposition step 9).
 *
 * Reads the stored key once on first paint, then mirrors every change back to
 * localStorage; clearing the key removes the entry instead of storing an empty
 * string, so a stale `X-Api-Key: ` header is never sent.
 */
export function useApiKey(): [string, (value: string) => void] {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');

  useEffect(() => {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey);
    else localStorage.removeItem(API_KEY_STORAGE);
  }, [apiKey]);

  return [apiKey, setApiKey];
}
