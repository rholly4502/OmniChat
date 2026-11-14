import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEvents } from '../hooks/useEvents';
import { EVENTS_URL, type PromoEvent } from '../eventsApi';

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

const EVENT: PromoEvent = {
  id: 9,
  aplikasi: 'OVO',
  judul: 'Cashback 50%',
  benefit: 'Maks Rp20.000',
  syarat: null,
  link: null,
  berlakuSampai: '2026-12-31',
  ditemukan: '2026-11-14',
  sourceId: null,
};

describe('useEvents', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse([EVENT]));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts loading with an empty list before the fetch settles', () => {
    const { result } = renderHook(() => useEvents(''));
    expect(result.current.loading).toBe(true);
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads events and clears loading on success', async () => {
    const { result } = renderHook(() => useEvents(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([EVENT]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(EVENTS_URL, expect.objectContaining({ method: 'GET' }));
  });

  it('sends the API key on the request', async () => {
    renderHook(() => useEvents('secret-key'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const keySent = fetchMock.mock.calls.some(
      ([url, init]) =>
        url === EVENTS_URL &&
        (init as RequestInit).headers !== undefined &&
        ((init as RequestInit).headers as Record<string, string>)['X-Api-Key'] === 'secret-key',
    );
    expect(keySent).toBe(true);
  });

  it('refetches with a `aplikasi` query param when the app filter changes', async () => {
    const { result } = renderHook(() => useEvents(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setAppFilter('OVO'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(`${EVENTS_URL}?aplikasi=OVO`, expect.anything());
  });

  it('clears the filter back to the unfiltered URL', async () => {
    const { result } = renderHook(() => useEvents(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setAppFilter('DANA'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => result.current.setAppFilter(''));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(EVENTS_URL, expect.anything());
  });

  it('surfaces a localized error and keeps the list empty on a 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    const { result } = renderHook(() => useEvents('bad-key'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Gagal memuat event (401).');
    expect(result.current.events).toEqual([]);
  });

  it('marks a non-HTTP failure with the generic message', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEvents(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Gagal memuat event.');
  });

  it('reload() forces a fresh fetch of the full list', async () => {
    const { result } = renderHook(() => useEvents(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.reload());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(EVENTS_URL, expect.anything());
  });

  it('aborts the in-flight request on unmount', async () => {
    const { unmount } = renderHook(() => useEvents(''));
    unmount();
    const lastCall = fetchMock.mock.calls[0];
    const signal = (lastCall?.[1] as RequestInit)?.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(true);
  });
});
