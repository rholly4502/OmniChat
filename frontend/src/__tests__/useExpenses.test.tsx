import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useExpenses, currentMonthKey } from '../hooks/useExpenses';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summaryPayload = {
  month: '2026-10',
  total: 20000,
  perKategori: { Lain: 20000 },
  targetNabung: 467000,
  anggaran: 520000,
  sisaAnggaran: 500000,
};

const pagePayload = {
  month: '2026-10',
  page: 1,
  pageSize: 200,
  total: 1,
  items: [{ id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Lain', keterangan: 'kopi', nominal: 20000 }],
};

function fetchStub(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [part, body] of Object.entries(routes)) {
      if (url.includes(part)) return jsonResponse(body);
    }
    return jsonResponse({ error: 'not found' }, 404);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('currentMonthKey', () => {
  it('formats a WIB date as YYYY-MM', () => {
    expect(currentMonthKey(new Date('2026-10-28T00:00:00Z'))).toBe('2026-10');
  });
});

describe('useExpenses', () => {
  it('loads the summary and transactions for the current month', async () => {
    const stub = fetchStub({ '/summary': summaryPayload, '/api/expenses?month': pagePayload });
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useExpenses('secret'));

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.summary!.targetNabung).toBe(467000);
    // both the summary and the list endpoints got the API key
    expect(stub.mock.calls.every(([url]) => url.includes('month='))).toBe(true);
  });

  it('fetches every page until total rows are collected', async () => {
    // Page 1 carry two rows, page 2 carries one; total says three.
    let listCalls = 0;
    const stub = vi.fn((url: string) => {
      if (url.includes('/summary')) return jsonResponse(summaryPayload);
      listCalls++;
      const items = listCalls === 1 ? [pagePayload.items[0], { ...pagePayload.items[0], id: 3 }] : [pagePayload.items[0]];
      return jsonResponse({ ...pagePayload, total: 3, items });
    });
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useExpenses('secret'));
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(listCalls).toBe(2);
  });

  it('surfaces a 401 as an error', async () => {
    const stub = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useExpenses('secret'));
    await waitFor(() => expect(result.current.error).toContain('401'));
    expect(result.current.summary).toBeNull();
  });

  it('refetches when the month changes', async () => {
    const stub = fetchStub({ '/summary': summaryPayload, '/api/expenses?month': pagePayload });
    vi.stubGlobal('fetch', stub);

    const { result } = renderHook(() => useExpenses('secret'));
    await waitFor(() => expect(result.current.summary).not.toBeNull());

    act(() => result.current.setMonth('2026-11'));
    await waitFor(() => expect(result.current.month).toBe('2026-11'));
    expect(stub.mock.calls.some(([url]) => url.includes('month=2026-11'))).toBe(true);
  });
});
