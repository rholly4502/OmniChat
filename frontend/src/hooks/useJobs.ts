import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { listOpportunities, updateOpportunityStatus, type Opportunity } from '../jobsApi';

export interface UseJobsResult {
  opportunities: Opportunity[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  reload: () => void;
  updateStatus: (id: number, status: string) => Promise<void>;
  updatingId: number | null;
}

/** Loads the curated job-opportunity list, with an optional pipeline status filter. */
export function useJobs(apiKey?: string): UseJobsResult {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const options = { apiKey, signal: controller.signal };

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await listOpportunities(options, statusFilter || undefined);
        if (!cancelled) setOpportunities(items);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? `Gagal memuat lowongan (${err.status}).` : 'Gagal memuat lowongan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiKey, statusFilter, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const updateStatus = useCallback(async (id: number, status: string) => {
    if (!apiKey) return;
    setUpdatingId(id);
    try {
      await updateOpportunityStatus(id, status, { apiKey });
      setReloadKey((k) => k + 1);
    } finally {
      setUpdatingId(null);
    }
  }, [apiKey]);

  return { opportunities, loading, error, statusFilter, setStatusFilter, reload, updateStatus, updatingId };
}
