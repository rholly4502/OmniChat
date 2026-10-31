import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../api';
import { listExpenses, getExpenseSummary, formatRupiah, exportExpensesCsv, exportExpensesPdf, getExpenseTrend, EXPENSES_URL } from '../expensesApi';

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

describe('exportExpensesCsv', () => {
  it('requests the export endpoint with the key and yields the blob', async () => {
    const blob = new Blob(['tanggal,nominal'], { type: 'text/csv' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    const result = await exportExpensesCsv('2026-10', { apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`${EXPENSES_URL}/export?month=2026-10`);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(result.type).toBe('text/csv');
  });

  it('throws ApiError on a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(exportExpensesCsv('2026-10', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});


describe('exportExpensesPdf', () => {
  it('requests the pdf export endpoint with the key and yields the blob', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    const result = await exportExpensesPdf('2026-10', { apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`${EXPENSES_URL}/export/pdf?month=2026-10`);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(result.type).toBe('application/pdf');
  });

  it('throws ApiError on a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(exportExpensesPdf('2026-10', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getExpenseTrend', () => {
  it('calls the trend endpoint, sends the key and parses points', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        months: 6,
        points: [
          { month: '2026-05', total: 100000 },
          { month: '2026-06', total: 0 },
        ],
      }),
    );
    const trend = await getExpenseTrend({ apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`${EXPENSES_URL}/trend?months=6`);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(trend.points).toHaveLength(2);
    expect(trend.points[0]).toEqual({ month: '2026-05', total: 100000 });
  });

  it('throws ApiError on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(getExpenseTrend({ fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});
