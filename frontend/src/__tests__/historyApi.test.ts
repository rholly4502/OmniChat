import { describe, it, expect, vi } from 'vitest';
import {
  CONVERSATIONS_URL,
  deleteConversation,
  getConversation,
  getConversationUsage,
  listAllConversations,
  listConversations,
  pinConversation,
  renameConversation,
  setMessageFeedback,
  archiveConversation,
  updateConversationSettings,
} from '../historyApi';
import { ApiError } from '../api';

const SUMMARY = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Rencana deploy',
  mode: 'agent',
  model: 'hermes',
  createdAt: '2026-10-25T10:00:00+00:00',
  updatedAt: '2026-10-25T10:05:00+00:00',
};

/** Minimal fetch Response stand-in: only what the client actually reads. */
function jsonResponse(body: unknown, init: { status?: number; retryAfter?: string } = {}) {
  const headers = new Headers();
  if (init.retryAfter) headers.set('Retry-After', init.retryAfter);
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function emptyResponse(status = 204) {
  return { ok: true, status, headers: new Headers() } as unknown as Response;
}

function fetchReturning(res: Response) {
  return vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
}

describe('listAllConversations', () => {
  it('pages until a page returns fewer than the page size, concatenating results', async () => {
    const A = { ...SUMMARY };
    const B = { ...SUMMARY, id: '22222222-2222-2222-2222-222222222222' };
    const C = { ...SUMMARY, id: '33333333-3333-3333-3333-333333333333' };
    const page1 = [A, B]; // full page (len == pageSize) => continue
    const page2 = [C]; // short page => stop
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    const rows = await listAllConversations({ fetchImpl }, undefined, undefined, 2);
    expect(rows).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('limit=2');
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain('offset=');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('offset=2');
  });

  it('stops on an empty page without infinite looping', async () => {
    const A = { ...SUMMARY };
    const B = { ...SUMMARY, id: '22222222-2222-2222-2222-222222222222' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([A, B]))
      .mockResolvedValueOnce(jsonResponse([]));
    const rows = await listAllConversations({ fetchImpl }, undefined, undefined, 2);
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('listConversations', () => {
  it('requests the collection with the limit appended', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    const rows = await listConversations({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(rows).toEqual([SUMMARY]);
  });

  it('sends the API key as X-Api-Key', async () => {
    const fetchImpl = fetchReturning(jsonResponse([]));

    await listConversations({ apiKey: 'secret', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'X-Api-Key': 'secret' } }),
    );
  });

  it('omits the header entirely when no key is configured', async () => {
    const fetchImpl = fetchReturning(jsonResponse([]));

    await listConversations({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} }),
    );
  });

  it('appends the search term when one is given', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, 'spotify');

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50&search=spotify`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('appends model and date filters when given', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, undefined, {
      model: 'claude-sonnet',
      mode: 'direct',
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50&model=claude-sonnet&mode=direct&from=2026-11-01&to=2026-11-30`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omits mode when it is blank', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, undefined, { model: '', mode: '', from: undefined, to: undefined });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omits filter params that are not provided', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, 'cek', { model: '', from: undefined, to: '' });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50&search=cek`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omits the search param when the term is blank', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, '   ');

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('URL-encodes the search term', async () => {
    const fetchImpl = fetchReturning(jsonResponse([SUMMARY]));

    await listConversations({ fetchImpl }, 50, 'Top up OVO');

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}?limit=50&search=Top%20up%20OVO`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns an empty list for a payload that is not an array', async () => {
    // A proxy error page or an envelope change must not crash the sidebar.
    const fetchImpl = fetchReturning(jsonResponse({ items: [] }));

    await expect(listConversations({ fetchImpl })).resolves.toEqual([]);
  });

  it('throws ApiError carrying the status and Retry-After', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 429, retryAfter: '30' }));

    const err = await listConversations({ fetchImpl }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).retryAfter).toBe('30');
  });
});

describe('getConversation', () => {
  it('requests one conversation by id and returns its transcript', async () => {
    const fetchImpl = fetchReturning(
      jsonResponse({ ...SUMMARY, messages: [{ id: 'm1', role: 'user', content: 'hai', createdAt: SUMMARY.createdAt }] }),
    );

    const detail = await getConversation(SUMMARY.id, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}/${SUMMARY.id}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0].content).toBe('hai');
  });

  it('throws ApiError for an unknown id', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 404 }));

    const err = await getConversation('missing', { fetchImpl }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});

describe('deleteConversation', () => {
  it('sends DELETE to the row path', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await deleteConversation(SUMMARY.id, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}/${SUMMARY.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws ApiError when the server refuses', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 404 }));

    await expect(deleteConversation('gone', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('renameConversation', () => {
  it('PATCHes a JSON body carrying the new title', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await renameConversation(SUMMARY.id, 'Judul baru', { fetchImpl });

    const [path, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(path).toBe(`${CONVERSATIONS_URL}/${SUMMARY.id}`);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(init.body).toBe(JSON.stringify({ title: 'Judul baru' }));
  });

  it('keeps the auth header alongside the JSON content type', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await renameConversation(SUMMARY.id, 'x', { apiKey: 'k', fetchImpl });

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(init.headers).toEqual({ 'X-Api-Key': 'k', 'Content-Type': 'application/json' });
  });
});

describe('pinConversation', () => {
  it('PUTs a JSON body carrying the pin state to the /pin path', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await pinConversation(SUMMARY.id, true, { fetchImpl });

    const [path, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(path).toBe(`${CONVERSATIONS_URL}/${SUMMARY.id}/pin`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(init.body).toBe(JSON.stringify({ isPinned: true }));
  });

  it('keeps the auth header alongside the JSON content type', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await pinConversation(SUMMARY.id, false, { apiKey: 'k', fetchImpl });

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(init.headers).toEqual({ 'X-Api-Key': 'k', 'Content-Type': 'application/json' });
  });

  it('throws ApiError when the server refuses', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 404 }));

    await expect(pinConversation('gone', true, { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('archiveConversation', () => {
  it('PUTs a JSON body carrying the archive state to the /archive path', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await archiveConversation(SUMMARY.id, true, { fetchImpl });

    const [path, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(path).toBe(`${CONVERSATIONS_URL}/${SUMMARY.id}/archive`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(init.body).toBe(JSON.stringify({ isArchived: true }));
  });

  it('throws ApiError when the server refuses', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 404 }));

    await expect(archiveConversation('gone', true, { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('setMessageFeedback', () => {
  it('PUTs a JSON body to the per-message feedback path', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await setMessageFeedback(SUMMARY.id, 'm0', 'up', { fetchImpl });

    const [path, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(path).toBe(`${CONVERSATIONS_URL}/${SUMMARY.id}/messages/m0/feedback`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(init.body).toBe(JSON.stringify({ feedback: 'up' }));
  });

  it('serializes a clear (null) rating too', async () => {
    const fetchImpl = fetchReturning(emptyResponse());

    await setMessageFeedback(SUMMARY.id, 'm0', null, { fetchImpl });

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ feedback: null }));
  });

  it('throws ApiError when the server refuses', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 404 }));

    await expect(setMessageFeedback('gone', 'm0', 'up', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getConversationUsage', () => {
  it('requests /usage and returns the parsed summary', async () => {
    const summary = {
      totalPromptTokens: 1100,
      totalCompletionTokens: 500,
      totalTokens: 1600,
      conversationCount: 3,
      byModel: { hermes: { promptTokens: 1100, completionTokens: 500, totalTokens: 1600 } },
    };
    const fetchImpl = fetchReturning(jsonResponse(summary));

    const got = await getConversationUsage({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}/usage`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(got).toEqual(summary);
  });

  it('sends the API key as X-Api-Key', async () => {
    const fetchImpl = fetchReturning(jsonResponse({ totalTokens: 0, byModel: {} }));

    await getConversationUsage({ apiKey: 'secret', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'X-Api-Key': 'secret' } }),
    );
  });

  it('returns the all-zero shape for a payload without totalTokens', async () => {
    const fetchImpl = fetchReturning(jsonResponse({ items: [] }));

    await expect(getConversationUsage({ fetchImpl })).resolves.toEqual({
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      conversationCount: 0,
      totalUpFeedback: 0,
      totalDownFeedback: 0,
      byModel: {},
    });
  });

  it('throws ApiError when the server refuses', async () => {
    const fetchImpl = fetchReturning(jsonResponse({}, { status: 429, retryAfter: '15' }));

    const err = await getConversationUsage({ fetchImpl }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).retryAfter).toBe('15');
  });
});

describe('updateConversationSettings', () => {
  it('sends a PUT to the settings endpoint with the body', async () => {
    const fetchImpl = fetchReturning(emptyResponse());
    const id = '11111111-1111-1111-1111-111111111111';

    await updateConversationSettings(id, { model: 'claude-sonnet', mode: 'direct' }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}/${id}/settings`,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet', mode: 'direct' }),
      }),
    );
  });

  it('forwards the API key to the settings request', async () => {
    const fetchImpl = fetchReturning(emptyResponse());
    const id = '11111111-1111-1111-1111-111111111111';

    await updateConversationSettings(id, { model: 'hermes-default' }, { apiKey: 'k', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${CONVERSATIONS_URL}/${id}/settings`,
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Api-Key': 'k' }) }),
    );
  });
});
