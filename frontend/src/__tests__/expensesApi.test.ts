import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../api';
import { listExpenses, getExpenseSummary, formatRupiah, exportExpensesCsv, exportExpensesPdf, getExpenseTrend, getExpenseAdvice, createExpense, updateExpense, deleteExpense, updateExpenseTarget, EXPENSES_URL } from '../expensesApi';

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

  it('includes category and search filters in the query string', async () => {
    const blob = new Blob(['tanggal,nominal'], { type: 'text/csv' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    await exportExpensesCsv('2026-10', { apiKey: 'secret', fetchImpl }, { kategori: 'Makan', q: 'warteg' });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('/export?month=2026-10');
    expect(url).toContain('kategori=Makan');
    expect(url).toContain('q=warteg');
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

  it('includes category and search filters in the query string', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    await exportExpensesPdf('2026-10', { apiKey: 'secret', fetchImpl }, { kategori: 'Transport', q: 'ojek' });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('/export/pdf?month=2026-10');
    expect(url).toContain('kategori=Transport');
    expect(url).toContain('q=ojek');
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

describe('getExpenseAdvice', () => {
  it('calls the advice endpoint with the date, sends the key and parses the payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        date: '2026-10-28',
        month: '2026-10',
        dayTotal: 320000,
        dailyBudget: 16774,
        status: 'over_budget',
        overBy: 303226,
        suggestions: ['Ganti minuman manis dengan air putih'],
        categoryTrend: [{ kategori: 'Belanja', total: 300000 }],
        projection: { spentSoFar: 320000, daysElapsed: 28, daysInMonth: 31, projectedTotal: 354286, anggaran: 520000, projectedOver: 0 },
        pcGoal: {
          parts: [{ name: 'VGA', price: 3500000 }],
          totalNeeded: 8700000,
          nabungSoFar: 1000000,
          percentCollected: 11.5,
          remaining: 7700000,
          potentialSavingPerMonth: 200000,
          monthsToReach: 39,
        },
      }),
    );
    const advice = await getExpenseAdvice('2026-10-28', { apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`${EXPENSES_URL}/advice?date=2026-10-28`);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(advice.status).toBe('over_budget');
    expect(advice.suggestions).toHaveLength(1);
    expect(advice.pcGoal.totalNeeded).toBe(8700000);
    expect(advice.pcGoal.monthsToReach).toBe(39);
  });

  it('throws ApiError on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(getExpenseAdvice('2026-10-28', { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createExpense', () => {
  it('POSTs the payload with the key and parses the created row', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: 7, tanggal: '2026-11-01', waktu: '10:00', kategori: 'Makan', keterangan: 'Sarapan', nominal: 20000 }, 201),
    );
    const row = await createExpense(
      { tanggal: '2026-11-01', waktu: '10:00', kategori: 'Makan', keterangan: 'Sarapan', nominal: 20000 },
      { apiKey: 'secret', fetchImpl },
    );

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe(`${EXPENSES_URL}`);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Api-Key': 'secret', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toMatchObject({ kategori: 'Makan', nominal: 20000 });
    expect(row.id).toBe(7);
    expect(row.nominal).toBe(20000);
  });

  it('throws ApiError on a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(
      createExpense({ tanggal: '2026-11-01', kategori: 'Makan', keterangan: 'x', nominal: 1000 }, { fetchImpl }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('updateExpense', () => {
  it('PUTs to the row id with the key and parses the updated row', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ id: 7, tanggal: '2026-11-02', waktu: '', kategori: 'Transport', keterangan: 'Gojek', nominal: 15000 }),
    );
    const row = await updateExpense(
      7,
      { tanggal: '2026-11-02', kategori: 'Transport', keterangan: 'Gojek', nominal: 15000 },
      { apiKey: 'secret', fetchImpl },
    );

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe(`${EXPENSES_URL}/7`);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(row.kategori).toBe('Transport');
  });
});

describe('deleteExpense', () => {
  it('DELETEs the row id with the key and resolves', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await deleteExpense(7, { apiKey: 'secret', fetchImpl });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe(`${EXPENSES_URL}/7`);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ 'X-Api-Key': 'secret' });
  });

  it('throws ApiError on a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(deleteExpense(999, { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });
});


describe('updateExpenseTarget', () => {
  it('PUTs the target payload with the API key and parses the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ month: '2026-11', anggaran: 400000, targetNabung: 250000 }),
    );
    const result = await updateExpenseTarget(
      { month: '2026-11', anggaran: 400000, targetNabung: 250000 },
      { apiKey: 'secret', fetchImpl },
    );

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe(`${EXPENSES_URL}/target`);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'X-Api-Key': 'secret' });
    expect(JSON.parse(String(init.body))).toEqual({ month: '2026-11', anggaran: 400000, targetNabung: 250000 });
    expect(result.anggaran).toBe(400000);
    expect(result.targetNabung).toBe(250000);
  });

  it('throws ApiError on a 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(
      updateExpenseTarget({ month: '2026-11', anggaran: 400000, targetNabung: 250000 }, { fetchImpl }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
