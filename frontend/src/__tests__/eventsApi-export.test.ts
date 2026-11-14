import { describe, it, expect, vi } from 'vitest';
import { EVENTS_URL, exportEventsCsv } from '../eventsApi';

describe('exportEventsCsv', () => {
  const csvBlob = new Blob(['aplikasi,judul'], { type: 'text/csv; charset=utf-8' });

  it('GETs /export with no auth header when no key is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(csvBlob) });
    const out = await exportEventsCsv({ fetchImpl: fetchMock as unknown as typeof fetch });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({});
    expect(out).toBe(csvBlob);
  });

  it('appends the aplikasi filter and sends the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(csvBlob) });
    await exportEventsCsv({ apiKey: 'secret-key', fetchImpl: fetchMock as unknown as typeof fetch }, 'OVO');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export?aplikasi=OVO`);
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('throws ApiError on a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    await expect(exportEventsCsv({ fetchImpl: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({ status: 401 });
  });
});
