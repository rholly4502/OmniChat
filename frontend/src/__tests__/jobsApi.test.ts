import { describe, it, expect, vi } from 'vitest';
import { JOBS_URL, listOpportunities, generateLamaranDraft, updateOpportunityFollowUp, OPPORTUNITY_STATUSES, type Opportunity } from '../jobsApi';

/** Minimal Response stand-in used across the jobs transport tests. */
function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}
function errResponse(status: number, retryAfter: string | null = null) {
  return { ok: false, status, headers: { get: (name: string) => (name === 'Retry-After' ? retryAfter : null) } };
}

const OPP: Opportunity = {
  id: 1,
  judul: 'Backend .NET Developer',
  perusahaan: 'PT Contoh',
  lokasi: 'Jakarta',
  tipe: 'Kontrak',
  gaji: 'IDR 15-25 jt',
  link: 'https://example.com/job',
  catatan: null,
  status: 'new',
  ditemukan: '2026-11-06',
  sourceId: null,
};

describe('listOpportunities', () => {
  it('GETs the base path with no auth header when no key is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([OPP]));
    const out = await listOpportunities({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect(out).toEqual([OPP]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(JOBS_URL);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({});
  });

  it('sends the API key as X-Api-Key when one is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    await listOpportunities({ apiKey: 'secret-key', fetchImpl: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'X-Api-Key': 'secret-key' });
  });

  it('appends an encoded ?status= filter when one is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    await listOpportunities({ fetchImpl: fetchMock as unknown as typeof fetch }, 'interview');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${JOBS_URL}?status=interview`);
  });

  it('throws an ApiError with the HTTP status and Retry-After when not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(429, '30'));
    await expect(listOpportunities({ fetchImpl: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({
      status: 429,
      retryAfter: '30',
    });
  });

  it('propagates the caller abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    const signal = new AbortController().signal;
    await listOpportunities({ fetchImpl: fetchMock as unknown as typeof fetch, signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(signal);
  });

  it('exposes the documented pipeline statuses in order', () => {
    expect(OPPORTUNITY_STATUSES).toEqual(['new', 'applied', 'interview', 'offer', 'closed']);
  });
});

describe('updateOpportunityFollowUp', () => {
  it('PATCHes the follow-up endpoint with the ISO date and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } });
    const fetchMock2 = fetchMock as unknown as typeof fetch;
    await updateOpportunityFollowUp(7, '2026-11-20', { apiKey: 'k', fetchImpl: fetchMock2 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${JOBS_URL}/7/follow-up`);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'X-Api-Key': 'k', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ tanggal: '2026-11-20' });
  });

  it('sends null to clear the follow-up date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } });
    await updateOpportunityFollowUp(7, null, { fetchImpl: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ tanggal: null });
  });

  it('throws ApiError on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    await expect(updateOpportunityFollowUp(7, '2026-11-20', { fetchImpl: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({ status: 404 });
  });
});

describe('generateLamaranDraft', () => {
  it('POSTs the draft endpoint with auth header and returns the draft', async () => {
    const draft = { coverLetter: 'Subject: Application for .NET Developer\n\nDear Hiring Manager,\n\n...', model: 'hermes' };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(draft));
    const out = await generateLamaranDraft(3, { apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch });
    expect(out).toEqual(draft);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${JOBS_URL}/3/lamaran-draft`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Api-Key': 'k' });
  });

  it('throws ApiError when the gateway reports a failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(502));
    await expect(generateLamaranDraft(3, { fetchImpl: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({ status: 502 });
  });

  it('propagates the abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ coverLetter: 'x', model: 'hermes' }));
    const signal = new AbortController().signal;
    await generateLamaranDraft(3, { fetchImpl: fetchMock as unknown as typeof fetch, signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(signal);
  });
});
