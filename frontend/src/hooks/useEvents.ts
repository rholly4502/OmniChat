import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { listEvents, type PromoEvent } from '../eventsApi';

export interface UseEventsResult {
  events: PromoEvent[];
  loading: boolean;
  error: string | null;
  appFilter: string;
  setAppFilter: (a: string) => void;
  reload: () => void;
}

/** Loads the curated promo/event list, with an optional platform filter. */
export function useEvents(apiKey?: string): UseEventsResult {
  const [events, setEvents] = useState<PromoEvent[]>([]);
  const [appFilter, setAppFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const options = { apiKey, signal: controller.signal };

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await listEvents(options, appFilter || undefined);
        if (!cancelled) setEvents(items);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? `Gagal memuat event (${err.status}).` : 'Gagal memuat event.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiKey, appFilter, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { events, loading, error, appFilter, setAppFilter, reload };
}
