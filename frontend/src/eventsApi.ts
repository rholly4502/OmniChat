import { ApiError } from './api';

/** Base path of the curated promo/event API. */
export const EVENTS_URL = '/api/events';

/** Credentials plus injectable transport, shared by every events call. */
export interface EventsRequestOptions {
  /** Sent as `X-Api-Key`; absent means "no auth header". */
  apiKey?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Aborts an in-flight request when the caller unmounts. */
  signal?: AbortSignal;
}

/** One curated promo event as served by `GET /api/events`. */
export interface PromoEvent {
  id: number;
  aplikasi: string;
  judul: string;
  benefit?: string | null;
  syarat?: string | null;
  link?: string | null;
  berlakuSampai?: string | null;
  ditemukan: string; // YYYY-MM-DD (WIB)
  sourceId?: string | null;
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'X-Api-Key': apiKey } : {};
}

/** Fetch the curated event list, optionally filtered by platform/app. */
export async function listEvents(
  options: EventsRequestOptions = {},
  aplikasi?: string,
): Promise<PromoEvent[]> {
  const path = aplikasi ? `${EVENTS_URL}?aplikasi=${encodeURIComponent(aplikasi)}` : EVENTS_URL;
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as PromoEvent[];
}
/** Download the curated event list as CSV bytes (RFC 4180, UTF-8 with BOM). */
export async function exportEventsCsv(
  options: EventsRequestOptions = {},
  aplikasi?: string,
): Promise<Blob> {
  const path = aplikasi ? `${EVENTS_URL}/export?aplikasi=${encodeURIComponent(aplikasi)}` : `${EVENTS_URL}/export`;
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
