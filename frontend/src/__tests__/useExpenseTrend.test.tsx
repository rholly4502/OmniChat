import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useExpenseTrend } from '../hooks/useExpenseTrend';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('useExpenseTrend', () => {
  it('loads trend points and exposes reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ months: 6, points: [{ month: '2026-10', total: 50000 }] }),
      ),
    );
    const { result } = renderHook(() => useExpenseTrend('secret'));
    await waitFor(() => expect(result.current.points).toHaveLength(1));
    expect(result.current.points[0]).toEqual({ month: '2026-10', total: 50000 });
    expect(result.current.error).toBeNull();
    expect(typeof result.current.reload).toBe('function');
  });

  it('surfaces an error on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const { result } = renderHook(() => useExpenseTrend('secret'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain('401');
  });
});
