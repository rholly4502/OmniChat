import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { getExpenseTrend, type ExpenseTrendPoint } from '../expensesApi';

/** Number of trailing months shown by the trend chart. */
export const TREND_MONTHS = 6;

export interface UseExpenseTrendResult {
  points: ExpenseTrendPoint[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches the monthly spend trend over the last {@link TREND_MONTHS} trailing
 * months. Re-fetches when the API key or a manual reload changes.
 */
export function useExpenseTrend(apiKey?: string): UseExpenseTrendResult {
  const [points, setPoints] = useState<ExpenseTrendPoint[]>([]);
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
        const trend = await getExpenseTrend(options, TREND_MONTHS);
        if (cancelled) return;
        setPoints(Array.isArray(trend.points) ? trend.points : []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? `Gagal memuat tren (${err.status}).` : 'Gagal memuat tren.');
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

  return { points, loading, error, reload };
}
