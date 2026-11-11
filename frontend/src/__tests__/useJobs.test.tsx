import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useJobs } from '../hooks/useJobs';
import { JOBS_URL, type Opportunity } from '../jobsApi';

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

const OPP: Opportunity = {
  id: 2,
  judul: 'Backend .NET Developer',
  perusahaan: 'PT Contoh',
  lokasi: 'Remote',
  tipe: 'FTE',
  gaji: null,
  link: null,
  catatan: 'Punya 2 tahun pengalaman',
  status: 'new',
  ditemukan: '2026-11-06',
  sourceId: null,
};

describe('useJobs', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse([OPP]));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts loading with an empty list before the fetch settles', () => {
    const { result } = renderHook(() => useJobs(''));
    expect(result.current.loading).toBe(true);
    expect(result.current.opportunities).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads opportunities and clears loading on success', async () => {
    const { result } = renderHook(() => useJobs(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.opportunities).toEqual([OPP]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(JOBS_URL, expect.objectContaining({ method: 'GET' }));
  });

  it('sends the API key on the request', async () => {
    renderHook(() => useJobs('secret-key'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const keySent = fetchMock.mock.calls.some(
      ([url, init]) =>
        url === JOBS_URL &&
        (init as RequestInit).headers !== undefined &&
        ((init as RequestInit).headers as Record<string, string>)['X-Api-Key'] === 'secret-key',
    );
    expect(keySent).toBe(true);
  });

  it('surfaces a localized error and keeps the list empty on a 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    const { result } = renderHook(() => useJobs('bad-key'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Gagal memuat lowongan (401).');
    expect(result.current.opportunities).toEqual([]);
  });

  it('marks a non-HTTP failure with the generic message', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useJobs(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Gagal memuat lowongan.');
  });

  it('refetches with a status filter when the filter changes', async () => {
    const { result } = renderHook(() => useJobs(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setStatusFilter('interview'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(`${JOBS_URL}?status=interview`, expect.anything());
  });

  it('reload() forces a fresh fetch and keeps the current filter', async () => {
    const { result } = renderHook(() => useJobs(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setStatusFilter('offer'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => result.current.reload());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(`${JOBS_URL}?status=offer`, expect.anything());
  });
});
