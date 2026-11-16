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

/** Write payload for creating or updating a promo event. */
export interface EventWritePayload {
  aplikasi: string;
  judul: string;
  benefit?: string | null;
  syarat?: string | null;
  link?: string | null;
  berlakuSampai?: string | null;
  ditemukan: string; // YYYY-MM-DD (WIB)
}

async function requestJson(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
  options: EventsRequestOptions = {},
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

/** Create a manually curated promo event (operator only). Returns the created event. */
export async function createEvent(
  payload: EventWritePayload,
  options: EventsRequestOptions = {},
): Promise<PromoEvent> {
  const res = await requestJson(EVENTS_URL, 'POST', payload, options);
  return (await res.json()) as PromoEvent;
}

/** Update an existing promo event (operator only). Returns the updated event. */
export async function updateEvent(
  id: number,
  payload: EventWritePayload,
  options: EventsRequestOptions = {},
): Promise<PromoEvent> {
  const res = await requestJson(`${EVENTS_URL}/${id}`, 'PUT', payload, options);
  return (await res.json()) as PromoEvent;
}

/** Delete a promo event (operator only). */
export async function deleteEvent(id: number, options: EventsRequestOptions = {}): Promise<void> {
  await requestJson(`${EVENTS_URL}/${id}`, 'DELETE', undefined, options);
}

/** Digest served by `GET /api/events/summary` for the Ringkasan card (WIB-based). */
export interface EventsSummary {
  /** Total number of curated events. */
  total: number;
  /** Number of distinct source platforms (aplikasi). */
  sumberUnik: number;
  /** Events whose known end date is today. */
  berakhirHariIni: number;
  /** Events whose known end date is tomorrow. */
  besokBerakhir: number;
  /** Events ending within the next 7 days (2–7 days out). */
  dalam7Hari: number;
  /** Events whose known end date has already passed (stale promos). */
  sudahBerakhir: number;
}

/** Fetch the curated-event digest (totals + expiry buckets). */
export async function fetchEventsSummary(options: EventsRequestOptions = {}): Promise<EventsSummary> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${EVENTS_URL}/summary`, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }
  return (await res.json()) as EventsSummary;
}
