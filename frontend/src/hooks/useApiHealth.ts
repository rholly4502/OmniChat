import { useEffect, useState } from 'react';
import { MODELS_URL } from '../constants';

/** Backend reachability as reported by {@link useApiHealth}. */
export type ApiStatus = 'checking' | 'online' | 'offline';

/** How often to re-probe the backend. */
const CHECK_INTERVAL_MS = 30_000;

/** How long a single probe may take before the backend is considered unreachable. */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Liveness probe for the OmniChat backend.
 *
 * Polls the model-catalog endpoint — the cheapest round trip the app already
 * makes — and treats ANY HTTP response as "online": a 200 (key set), a 401
 * (no key) or a 429 all prove the server answered, while only a transport
 * failure or timeout means the backend cannot be reached. Returns a status
 * that the sidebar renders as a quiet note, so a dead backend is visible
 * before the user hits Send.
 */
export function useApiHealth(checkUrl: string = MODELS_URL): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      try {
        // fetch resolves for every HTTP status; only transport errors reject.
        await fetch(checkUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        if (!cancelled) setStatus('online');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };

    void check();
    timer = setInterval(() => {
      void check();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // checkUrl is stable across renders (default or module constant).
  }, [checkUrl]);

  return status;
}
