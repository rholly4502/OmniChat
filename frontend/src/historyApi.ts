import { ApiError } from './api';
import type { ConversationDetail, ConversationSummary, ConversationUsageSummary } from './types';

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

/** Optional narrowing for the history list: a model id plus an updated-at window. */
export interface ConversationListFilters {
  /** Only conversations last run on this model id. */
  model?: string;
  /** Inclusive start date (ISO `yyyy-MM-dd`) of the updated-at window. */
  from?: string;
  /** Inclusive end date (ISO `yyyy-MM-dd`) of the updated-at window. */
  to?: string;
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
  search?: string,
  filters: ConversationListFilters = {},
): Promise<ConversationSummary[]> {
  const term = search?.trim();
  // Built by hand rather than with URLSearchParams so spaces stay `%20` (that
  // class encodes them as `+`, which would needlessly change the API contract).
  const parts = [`limit=${limit}`];
  if (term) parts.push(`search=${encodeURIComponent(term)}`);
  if (filters.model) parts.push(`model=${encodeURIComponent(filters.model)}`);
  if (filters.from) parts.push(`from=${encodeURIComponent(filters.from)}`);
  if (filters.to) parts.push(`to=${encodeURIComponent(filters.to)}`);
  const res = await request(`${CONVERSATIONS_URL}?${parts.join('&')}`, { method: 'GET' }, options);
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

/** Optional per-conversation settings update: model id and/or chat mode. */
export interface ConversationSettingsUpdate {
  /** Model id to persist, e.g. "hermes-default". */
  model?: string;
  /** Chat mode to persist: "agent" or "direct". */
  mode?: string;
}

/**
 * Persist a per-conversation model and/or mode change so resuming the thread
 * resumes with the setup it last used, even before the next turn is sent.
 * Fields left undefined are unchanged on the server. Resolves on 204.
 */
export async function updateConversationSettings(
  id: string,
  settings: ConversationSettingsUpdate,
  options: HistoryRequestOptions = {},
): Promise<void> {
  await request(
    `${CONVERSATIONS_URL}/${id}/settings`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    },
    options,
  );
}

/** Toggle a conversation's pin state. Resolves on 204. */
export async function pinConversation(
  id: string,
  isPinned: boolean,
  options: HistoryRequestOptions = {},
): Promise<void> {
  await request(
    `${CONVERSATIONS_URL}/${id}/pin`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned }),
    },
    options,
  );
}

/**
 * Set or clear a user's rating on one stored turn. Resolves on 204. The
 * feedback value is "up", "down" or null (clear). Only admin callers succeed;
 * guests and drafts keep their local-only toggle.
 */
export async function setMessageFeedback(
  conversationId: string,
  messageId: string,
  feedback: 'up' | 'down' | null,
  options: HistoryRequestOptions = {},
): Promise<void> {
  await request(
    `${CONVERSATIONS_URL}/${conversationId}/messages/${messageId}/feedback`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    },
    options,
  );
}

/**
 * Fetch the aggregate token usage for all of the caller's conversations. An
 * admin sees real totals; a guest gets the all-zero shape, so the audit panel
 * renders the same either way.
 */
export async function getConversationUsage(
  options: HistoryRequestOptions = {},
): Promise<ConversationUsageSummary> {
  const res = await request(`${CONVERSATIONS_URL}/usage`, { method: 'GET' }, options);
  const payload = (await res.json()) as unknown;
  if (!payload || typeof payload !== 'object' || !('totalTokens' in payload)) {
    return { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, conversationCount: 0, totalUpFeedback: 0, totalDownFeedback: 0, byModel: {} };
  }
  return payload as ConversationUsageSummary;
}
