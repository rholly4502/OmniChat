import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApiHealth } from '../hooks/useApiHealth';

describe('useApiHealth', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('starts in the checking state before the first probe settles', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useApiHealth('/api/models'));
    expect(result.current).toBe('checking');
  });

  it('reports online when the endpoint answers 200', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true }));
    const { result } = renderHook(() => useApiHealth('/api/models'));
    await waitFor(() => expect(result.current).toBe('online'));
  });

  it('treats any HTTP response as online — a 401 auth wall still proves the server is up', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401 }));
    const { result } = renderHook(() => useApiHealth('/api/models'));
    await waitFor(() => expect(result.current).toBe('online'));
  });

  it('reports offline on a transport failure (network error / no backend)', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useApiHealth('/api/models'));
    await waitFor(() => expect(result.current).toBe('offline'));
  });

  it('uses the given probe endpoint', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true }));
    renderHook(() => useApiHealth('/custom/health'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/custom/health', expect.any(Object)));
  });
});
