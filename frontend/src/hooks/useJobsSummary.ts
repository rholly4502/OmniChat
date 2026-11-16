import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { fetchJobsSummary, type JobsSummary } from '../jobsApi';

export interface UseJobsSummaryResult {
  summary: JobsSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads the job-pipeline overview from `GET /api/jobs/summary`. */
export function useJobsSummary(apiKey?: string): UseJobsSummaryResult {
  const [summary, setSummary] = useState<JobsSummary | null>(null);
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
        const data = await fetchJobsSummary({ apiKey, signal: controller.signal });
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiError
            ? `Gagal memuat ringkasan lowongan (${err.status}).`
            : 'Gagal memuat ringkasan lowongan.',
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
