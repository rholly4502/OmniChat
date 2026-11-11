import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { downloadCvFile, generateLamaranDraft, listCvFiles, listOpportunities, updateOpportunityFollowUp, updateOpportunityStatus, type LamaranDraft, type Opportunity } from '../jobsApi';

export interface UseJobsResult {
  opportunities: Opportunity[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  reload: () => void;
  updateStatus: (id: number, status: string) => Promise<void>;
  updateFollowUp: (id: number, tanggal: string | null) => Promise<void>;
  updatingId: number | null;
  generatingId: number | null;
  generateDraft: (id: number) => Promise<LamaranDraft | null>;
  cvFiles: string[];
  cvError: string | null;
  /** Downloads one CV PDF via the authenticated endpoint; resolves to the file name on success. */
  downloadCv: (name: string) => Promise<string | null>;
}

/** Loads the curated job-opportunity list, with an optional pipeline status filter. */
export function useJobs(apiKey?: string): UseJobsResult {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

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

  const updateFollowUp = useCallback(async (id: number, tanggal: string | null) => {
    if (!apiKey) return;
    setUpdatingId(id);
    try {
      await updateOpportunityFollowUp(id, tanggal, { apiKey });
      setReloadKey((k) => k + 1);
    } finally {
      setUpdatingId(null);
    }
  }, [apiKey]);

  const generateDraft = useCallback(async (id: number): Promise<LamaranDraft | null> => {
    if (!apiKey) return null;
    setGeneratingId(id);
    try {
      return await generateLamaranDraft(id, { apiKey });
    } finally {
      setGeneratingId(null);
    }
  }, [apiKey]);

  const [cvFiles, setCvFiles] = useState<string[]>([]);
  const [cvError, setCvError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    (async () => {
      try {
        const files = await listCvFiles({ apiKey });
        if (!cancelled) { setCvFiles(files); setCvError(null); }
      } catch (err) {
        if (!cancelled) {
          setCvError(err instanceof ApiError ? `Gagal memuat CV (${err.status}).` : 'Gagal memuat CV.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey]);

  const downloadCv = useCallback(async (name: string): Promise<string | null> => {
    if (!apiKey) return null;
    try {
      const blob = await downloadCvFile(name, { apiKey });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return name;
    } catch {
      return null;
    }
  }, [apiKey]);

  return { opportunities, loading, error, statusFilter, setStatusFilter, reload, updateStatus, updateFollowUp, updatingId, generatingId, generateDraft, cvFiles, cvError, downloadCv };
}
