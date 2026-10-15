import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useModelCatalog } from '../hooks/useModelCatalog';
import { MODELS_URL, DEFAULT_AGENT_MODELS, DEFAULT_DIRECT_MODELS } from '../constants';

/**
 * Unit tests for the extracted /api/models hook (frontend decomposition
 * step 5). These pin the behaviour the inline App.tsx effect had, so the
 * refactor cannot silently change fallback or refresh semantics.
 */

const MOCK_CATALOG = {
  agent: [{ id: 'test-agent', label: 'Test Agent Model' }],
  direct: [{ id: 'test-direct', label: 'Test Direct Model' }],
};

/** Minimal Response stand-in; only .ok / .status / .json() are used. */
function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}
function errResponse(status: number) {
  return { ok: false, status, json: () => Promise.resolve({}) };
}

describe('useModelCatalog', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse(MOCK_CATALOG));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts on the built-in defaults before the fetch settles', () => {
    const { result } = renderHook(() => useModelCatalog(''));

    expect(result.current.agent).toEqual(DEFAULT_AGENT_MODELS);
    expect(result.current.direct).toEqual(DEFAULT_DIRECT_MODELS);
  });

  it('adopts the server catalog once the response is ok', async () => {
    const { result } = renderHook(() => useModelCatalog(''));

    await waitFor(() => expect(result.current.agent).toEqual(MOCK_CATALOG.agent));
    expect(result.current.direct).toEqual(MOCK_CATALOG.direct);
    expect(fetchMock).toHaveBeenCalledWith(MODELS_URL, { headers: undefined });
  });

  it('sends the API key as X-Api-Key when one is set', async () => {
    renderHook(() => useModelCatalog('secret-key'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(MODELS_URL, {
      headers: { 'X-Api-Key': 'secret-key' },
    });
  });

  it('keeps the defaults when the response is not ok (401)', async () => {
    fetchMock.mockResolvedValue(errResponse(401));

    const { result } = renderHook(() => useModelCatalog('bad-key'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.agent).toEqual(DEFAULT_AGENT_MODELS);
    expect(result.current.direct).toEqual(DEFAULT_DIRECT_MODELS);
  });

  it('keeps the defaults when the network throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useModelCatalog(''));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.agent).toEqual(DEFAULT_AGENT_MODELS);
  });

  it('falls back per-list when a payload list is empty or missing', async () => {
    fetchMock.mockResolvedValue(okResponse({ agent: [], direct: [{ id: 'x', label: 'X' }] }));

    const { result } = renderHook(() => useModelCatalog(''));

    await waitFor(() => expect(result.current.direct).toEqual([{ id: 'x', label: 'X' }]));
    expect(result.current.agent).toEqual(DEFAULT_AGENT_MODELS);
  });

  it('refetches when the API key changes', async () => {
    const { rerender } = renderHook(({ key }) => useModelCatalog(key), {
      initialProps: { key: '' },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ key: 'new-key' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(MODELS_URL, {
      headers: { 'X-Api-Key': 'new-key' },
    });
  });

  it('does not refetch when the key is unchanged across a rerender', async () => {
    const { rerender } = renderHook(({ key }) => useModelCatalog(key), {
      initialProps: { key: 'stable' },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ key: 'stable' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a response that lands after unmount', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useModelCatalog(''));
    unmount();
    // Resolve after unmount — React must not warn about a state update.
    resolveFetch(okResponse(MOCK_CATALOG));
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
