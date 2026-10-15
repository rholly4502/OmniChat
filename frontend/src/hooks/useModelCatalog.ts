import { useEffect, useState } from 'react';
import type { ModelCatalog } from '../types';
import {
  MODELS_URL,
  DEFAULT_AGENT_MODELS,
  DEFAULT_DIRECT_MODELS,
} from '../constants';

/**
 * Fetches the model catalog from the backend and keeps it in state.
 *
 * Extracted from App.tsx (frontend decomposition step 5). Behaviour is
 * unchanged from the inline effect it replaces:
 *  - starts on the built-in defaults, so the first paint is never empty
 *  - refetches whenever the API key changes (the key gates /api/models)
 *  - falls back to the defaults for a non-OK response, a network failure,
 *    or a payload with an empty/missing list
 *  - drops the result of a request that resolves after the key changed or
 *    the component unmounted
 *
 * A failed fetch is silent by design: the sidebar keeps showing the last
 * known-good (or default) catalog rather than an error state.
 */
export function useModelCatalog(apiKey: string): ModelCatalog {
  const [catalog, setCatalog] = useState<ModelCatalog>({
    agent: DEFAULT_AGENT_MODELS,
    direct: DEFAULT_DIRECT_MODELS,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(MODELS_URL, {
      headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Partial<ModelCatalog>) => {
        if (cancelled) return;
        setCatalog({
          agent: data.agent?.length ? data.agent : DEFAULT_AGENT_MODELS,
          direct: data.direct?.length ? data.direct : DEFAULT_DIRECT_MODELS,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return catalog;
}
