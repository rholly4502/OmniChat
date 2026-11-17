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

  it('appends keyword and hideExpired filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(csvBlob) });
    await exportEventsCsv({ fetchImpl: fetchMock as unknown as typeof fetch }, 'OVO', 'cashback', true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export?aplikasi=OVO&q=cashback&hideExpired=true`);
  });

  it('omits query string when no filters are set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(csvBlob) });
    await exportEventsCsv({ fetchImpl: fetchMock as unknown as typeof fetch });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export`);
  });

  it('throws ApiError on a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    await expect(exportEventsCsv({ fetchImpl: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({ status: 401 });
  });
});

describe('event write transport', () => {
  const event = { id: 1, aplikasi: 'GoPay', judul: 'Cashback', ditemukan: '2026-11-14' };
  const json = () => Promise.resolve(event);
  const okRes = { ok: true, status: 200, json };
  const payload = { aplikasi: 'GoPay', judul: 'Cashback 20%', ditemukan: '2026-11-14' };

  it('createEvent POSTs a JSON body with the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRes);
    const out = await import('../eventsApi').then((m) => m.createEvent(payload, { apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('k');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(out).toEqual(event);
  });

  it('updateEvent PUTs to /api/events/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRes);
    await import('../eventsApi').then((m) => m.updateEvent(7, payload, { fetchImpl: fetchMock as unknown as typeof fetch }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/7`);
    expect(init.method).toBe('PUT');
  });

  it('deleteEvent DELETEs to /api/events/{id} with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await import('../eventsApi').then((m) => m.deleteEvent(7, { fetchImpl: fetchMock as unknown as typeof fetch }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/7`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('throws ApiError on a non-OK write response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    await expect(import('../eventsApi').then((m) => m.createEvent(payload, { fetchImpl: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({ status: 401 });
  });
});

describe('exportEventsPdf', () => {
  const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

  it('GETs /export?format=pdf with no auth header when no key is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(pdfBlob) });
    const out = await import('../eventsApi').then((m) => m.exportEventsPdf({ fetchImpl: fetchMock as unknown as typeof fetch }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export?format=pdf`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({});
    expect(out).toBe(pdfBlob);
  });

  it('appends filters plus format=pdf and sends the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(pdfBlob) });
    await import('../eventsApi').then((m) => m.exportEventsPdf({ apiKey: 'secret-key', fetchImpl: fetchMock as unknown as typeof fetch }, 'OVO', 'cashback', true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${EVENTS_URL}/export?aplikasi=OVO&q=cashback&hideExpired=true&format=pdf`);
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('throws ApiError on a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    await expect(import('../eventsApi').then((m) => m.exportEventsPdf({ fetchImpl: fetchMock as unknown as typeof fetch }))).rejects.toMatchObject({ status: 401 });
  });
});
