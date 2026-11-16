import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useJobsSummary } from '../hooks/useJobsSummary';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summaryPayload = {
  perStatus: { new: 2, applied: 1, interview: 3, offer: 1, closed: 2 },
  total: 9,
  followUpTerlambat: 1,
  followUpHariIni: 1,
  followUp7Hari: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useJobsSummary', () => {
  it('loads the pipeline overview and exposes reload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summaryPayload));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useJobsSummary('secret'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.summary).toEqual(summaryPayload);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/jobs/summary');

    const before = fetchMock.mock.calls.length;
    result.current.reload();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('sets an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Boom' }, 500)));

    const { result } = renderHook(() => useJobsSummary('secret'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toContain('Gagal memuat ringkasan lowongan');
  });
});
