import { ApiError } from './api';

/** Base path of the curated job-opportunity API. */
export const JOBS_URL = '/api/jobs';

/** Credentials plus injectable transport, shared by every jobs call. */
export interface JobsRequestOptions {
  /** Sent as `X-Api-Key`; absent means "no auth header". */
  apiKey?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Aborts an in-flight request when the caller unmounts or switches key. */
  signal?: AbortSignal;
}

/** One curated job opportunity as served by `GET /api/jobs`. */
export interface Opportunity {
  id: number;
  judul: string;
  perusahaan: string;
  lokasi: string;
  tipe: string;
  gaji?: string | null;
  link?: string | null;
  catatan?: string | null;
  status: string;
  followUpTanggal?: string | null; // YYYY-MM-DD
  ditemukan: string; // YYYY-MM-DD (WIB)
  sourceId?: string | null;
  skor?: number | null;
}

/** Pipeline filter values shown to the user. */
export const OPPORTUNITY_STATUSES = ['new', 'applied', 'interview', 'offer', 'closed'] as const;

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'X-Api-Key': apiKey } : {};
}

/** Fetch the curated opportunity list, optionally filtered by pipeline status. */
export async function listOpportunities(
  options: JobsRequestOptions = {},
  status?: string,
): Promise<Opportunity[]> {
  const path = status ? `${JOBS_URL}?status=${encodeURIComponent(status)}` : JOBS_URL;
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as Opportunity[];
}

/** Move one opportunity to another pipeline stage. 204 on success. */
export async function updateOpportunityStatus(
  id: number,
  status: string,
  options: JobsRequestOptions = {},
): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${JOBS_URL}/${id}/status`, {
    method: 'PATCH',
    headers: { ...authHeaders(options.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
}

/** Set/clear a follow-up target date for one opportunity. 204 on success. */
export async function updateOpportunityFollowUp(
  id: number,
  tanggal: string | null,
  options: JobsRequestOptions = {},
): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${JOBS_URL}/${id}/follow-up`, {
    method: 'PATCH',
    headers: { ...authHeaders(options.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tanggal }),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
}
