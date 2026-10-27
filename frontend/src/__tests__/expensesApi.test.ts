import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../api';
import { listExpenses, getExpenseSummary, formatRupiah, EXPENSES_URL } from '../expensesApi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('formatRupiah', () => {
  it('formats a rupiah integer with thousands separators', () => {
    expect(formatRupiah(20000)).toContain('20.000');
    expect(formatRupiah(0)).toContain('0');
  });
});

describe('listExpenses', () => {
  it('calls the month endpoint, sends the API key header and parses the page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        month: '2026-10',
        page: 1,
        pageSize: 200,
        total: 1,
        items: [{ id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Lain', keterangan: 'kopi', nominal: 20000 }],
      }),
    );
    const page = await listExpenses('2026-10', { apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`${EXPENSES_URL}?month=2026-10`);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(page.total).toBe(1);
    expect(page.items[0].kategori).toBe('Lain');
  });

  it('throws ApiError on a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(listExpenses('2026-10', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getExpenseSummary', () => {
  it('parses the summary payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        month: '2026-10',
        total: 20000,
        perKategori: { Lain: 20000 },
        targetNabung: 467000,
        anggaran: 520000,
        sisaAnggaran: 500000,
      }),
    );
    const summary = await getExpenseSummary('2026-10', { apiKey: 'secret', fetchImpl });
    expect(String(fetchImpl.mock.calls[0][0])).toContain(`${EXPENSES_URL}/summary?month=2026-10`);
    expect(summary.total).toBe(20000);
    expect(summary.perKategori).toEqual({ Lain: 20000 });
    expect(summary.anggaran).toBe(520000);
  });
});
