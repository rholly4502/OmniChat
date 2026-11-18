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

/** A generated cover-letter draft, as returned by `POST /api/jobs/{id}/lamaran-draft`. */
export interface LamaranDraft {
  coverLetter: string;
  model: string;
}

/**
 * Generate a first-draft cover letter for one opportunity by calling the Hermes
 * gateway. The returned draft is for review, not auto-submission.
 */
export async function generateLamaranDraft(
  id: number,
  options: JobsRequestOptions = {},
): Promise<LamaranDraft> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${JOBS_URL}/${id}/lamaran-draft`, {
    method: 'POST',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as LamaranDraft;
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

/** Download the curated opportunity list as CSV bytes (RFC 4180, UTF-8 with BOM). */
export interface OpportunityExportFilters {
  status?: string;
  tipe?: string;
  tier?: string;
  q?: string;
  followUpOnly?: boolean;
  today?: string;
}

function buildExportQuery(filters: OpportunityExportFilters, format: string): string {
  const params = new URLSearchParams({ format });
  if (filters.status) params.set('status', filters.status);
  if (filters.tipe) params.set('tipe', filters.tipe);
  if (filters.tier) params.set('tier', filters.tier);
  if (filters.q) params.set('q', filters.q);
  if (filters.followUpOnly) params.set('followUpOnly', 'true');
  if (filters.followUpOnly && filters.today) params.set('today', filters.today);
  return params.toString();
}

export async function exportOpportunitiesCsv(
  options: JobsRequestOptions = {},
  filters: OpportunityExportFilters = {},
): Promise<Blob> {
  const qs = buildExportQuery(filters, 'csv');
  const path = `${JOBS_URL}/export?${qs}`;
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return await res.blob();
}

/**
 * Downloads the curated pipeline as a PDF (server-rendered). Honors the same
 * filters as {@link exportOpportunitiesCsv} via `format=pdf`.
 */
export async function exportOpportunitiesPdf(
  options: JobsRequestOptions = {},
  filters: OpportunityExportFilters = {},
): Promise<Blob> {
  const qs = buildExportQuery(filters, 'pdf');
  const path = `${JOBS_URL}/export?${qs}`;
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return await res.blob();
}

/**
 * Pipeline overview as served by `GET /api/jobs/summary`: per-status counts
 * plus follow-up urgency buckets relative to the server's WIB day.
 */
/** One active opportunity surfaced on the digest as a top match. */
export interface TopOpportunity {
  /** Opportunity id. */
  id: number;
  /** Job title. */
  judul: string;
  /** Company / hiring organization. */
  perusahaan: string;
  /** Fit score 0-100. */
  skor: number;
}

export interface JobsSummary {
  /** Count of opportunities per pipeline status (key = status name). */
  perStatus: Record<string, number>;
  /** Total number of opportunities. */
  total: number;
  /** Active-stage follow-ups with a target date before today. */
  followUpTerlambat: number;
  /** Active-stage follow-ups targeted for today. */
  followUpHariIni: number;
  /** Active-stage follow-ups targeted within the next 7 days. */
  followUp7Hari: number;
  /** Top 3 active opportunities by fit score, best first. */
  topCocok: TopOpportunity[];
}

/** Fetch the pipeline overview (per-status counts + follow-up urgency buckets). */
export async function fetchJobsSummary(options: JobsRequestOptions = {}): Promise<JobsSummary> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${JOBS_URL}/summary`, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as JobsSummary;
}

/** Base path of the authenticated CV download service. */
export const CV_URL = '/api/cv';

/** List available CV file names. */
export async function listCvFiles(
  options: JobsRequestOptions = {},
): Promise<string[]> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(CV_URL, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as string[];
}

/** Download one CV PDF, returning the raw file blob (caller triggers the browser download). */
export async function downloadCvFile(
  fileName: string,
  options: JobsRequestOptions = {},
): Promise<Blob> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${CV_URL}/${encodeURIComponent(fileName)}`, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return res.blob();
}

/** Write payload for creating or updating a curated job opportunity. */
export interface JobWritePayload {
  judul: string;
  perusahaan: string;
  lokasi: string;
  tipe: string;
  gaji?: string | null;
  skor?: number | null;
  link?: string | null;
  catatan?: string | null;
  status?: string | null;
  followUpTanggal?: string | null; // YYYY-MM-DD or null
  ditemukan: string; // YYYY-MM-DD (WIB)
}

async function requestJson(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
  options: JobsRequestOptions = {},
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method,
    headers: {
      ...authHeaders(options.apiKey),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return res;
}

/** Create a manually curated job opportunity (operator only). Returns the created opportunity. */
export async function createJob(
  payload: JobWritePayload,
  options: JobsRequestOptions = {},
): Promise<Opportunity> {
  const res = await requestJson(JOBS_URL, 'POST', payload, options);
  return (await res.json()) as Opportunity;
}

/** Update an existing job opportunity (operator only). Returns the updated opportunity. */
export async function updateJob(
  id: number,
  payload: JobWritePayload,
  options: JobsRequestOptions = {},
): Promise<Opportunity> {
  const res = await requestJson(`${JOBS_URL}/${id}`, 'PUT', payload, options);
  return (await res.json()) as Opportunity;
}

/** Delete a job opportunity (operator only). */
export async function deleteJob(id: number, options: JobsRequestOptions = {}): Promise<void> {
  await requestJson(`${JOBS_URL}/${id}`, 'DELETE', undefined, options);
}
