import { ApiError } from './api';
import type { ConversationDetail, ConversationSummary } from './types';

/** Base path of the read-side history API (see `ConversationsController`). */
export const CONVERSATIONS_URL = '/api/conversations';

/** Credentials plus injectable transport, shared by every history call. */
export interface HistoryRequestOptions {
  /** Sent as `X-Api-Key`; absent means "no auth header". */
  apiKey?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Aborts an in-flight request when the caller unmounts or switches key. */
  signal?: AbortSignal;
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'X-Api-Key': apiKey } : {};
}

/**
 * Perform one history request and fail loudly on a non-2xx status.
 *
 * `Retry-After` is read defensively (`headers` is optional on a mocked
 * Response) so a caller can still show the rate-limit countdown.
 */
async function request(
  path: string,
  init: RequestInit,
  options: HistoryRequestOptions,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    ...init,
    headers: { ...authHeaders(options.apiKey), ...(init.headers as Record<string, string> | undefined) },
    signal: options.signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }

  return res;
}

/**
 * List the caller's conversations, newest first, without message bodies.
 *
 * A guest gets an empty array from the server (200, not 403), so the sidebar
 * needs no guest branch: no sessions simply renders no history list.
 */
export async function listConversations(
  options: HistoryRequestOptions = {},
  limit = 50,
): Promise<ConversationSummary[]> {
  const res = await request(`${CONVERSATIONS_URL}?limit=${limit}`, { method: 'GET' }, options);
  const payload = (await res.json()) as unknown;
  // A malformed body must not reach the sidebar as `undefined.map(...)`.
  return Array.isArray(payload) ? (payload as ConversationSummary[]) : [];
}

/** Fetch one conversation with its transcript, oldest message first. */
export async function getConversation(
  id: string,
  options: HistoryRequestOptions = {},
): Promise<ConversationDetail> {
  const res = await request(`${CONVERSATIONS_URL}/${id}`, { method: 'GET' }, options);
  return (await res.json()) as ConversationDetail;
}

/** Delete a conversation and its messages. Resolves on 204. */
export async function deleteConversation(
  id: string,
  options: HistoryRequestOptions = {},
): Promise<void> {
  await request(`${CONVERSATIONS_URL}/${id}`, { method: 'DELETE' }, options);
}

/** Rename a conversation. Resolves on 204. */
export async function renameConversation(
  id: string,
  title: string,
  options: HistoryRequestOptions = {},
): Promise<void> {
  await request(
    `${CONVERSATIONS_URL}/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
    options,
  );
}
