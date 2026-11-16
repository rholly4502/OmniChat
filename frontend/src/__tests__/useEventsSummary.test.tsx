import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEventsSummary } from '../hooks/useEventsSummary';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summaryPayload = {
  total: 7,
  sumberUnik: 3,
  berakhirHariIni: 1,
  besokBerakhir: 1,
  dalam7Hari: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEventsSummary', () => {
  it('loads the event digest and exposes reload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summaryPayload));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEventsSummary('secret'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual(summaryPayload);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/events/summary');

    const before = fetchMock.mock.calls.length;
    result.current.reload();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('sets an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Boom' }, 500)));

    const { result } = renderHook(() => useEventsSummary('secret'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toContain('Gagal memuat ringkasan event');
  });
});
