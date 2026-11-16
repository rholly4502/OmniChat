import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { fetchEventsSummary, type EventsSummary } from '../eventsApi';

export interface UseEventsSummaryResult {
  summary: EventsSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads the curated-event digest from `GET /api/events/summary`. */
export function useEventsSummary(apiKey?: string): UseEventsSummaryResult {
  const [summary, setSummary] = useState<EventsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchEventsSummary({ apiKey, signal: controller.signal });
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiError
            ? `Gagal memuat ringkasan event (${err.status}).`
            : 'Gagal memuat ringkasan event.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { summary, loading, error, reload };
}
