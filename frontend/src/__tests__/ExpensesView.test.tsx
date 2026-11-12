import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ExpensesView } from '../components/ExpensesView';
import { findDuplicateExpense } from '../expenseDup';
import type { ExpenseItem } from '../expensesApi';
import { currentMonthKey } from '../hooks/useExpenses';
import { remainingDailyBudget } from '../expenseBudget';
import { formatRupiah } from '../expensesApi';

// jsdom does not implement scrollIntoView; stub it so the edit-form
// auto-scroll effect can run harmlessly in tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summaryPayload = {
  month: '2026-10',
  total: 20000,
  perKategori: { Makan: 12000, Lain: 8000 },
  targetNabung: 467000,
  anggaran: 520000,
  sisaAnggaran: 500000,
};

const pagePayload = {
  month: '2026-10',
  page: 1,
  pageSize: 200,
  total: 2,
  items: [
    { id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 },
    { id: 2, tanggal: '2026-10-27', waktu: '09:00', kategori: 'Lain', keterangan: 'Kopi', nominal: 8000 },
  ],
};

function fetchStub() {
  return vi.fn((url: string) =>
    url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Today's WIB date as YYYY-MM-DD (mirrors the ExpensesView default). */
function wibTodayTest(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

describe('ExpensesView', () => {
  it('renders the month picker, summary cards, categories and transactions', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);

    expect(screen.getByRole('heading', { name: 'Pengeluaran' })).toBeInTheDocument();
    expect(screen.getByLabelText('Bulan pengeluaran')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    // The monthly total also appears as that week's row in the weekly breakdown,
    // so the amount can legitimately render more than once.
    expect(screen.getAllByText('Rp 20.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Target Nabung')).toBeInTheDocument();
    expect(screen.getByText('Warteg')).toBeInTheDocument();
    expect(screen.getAllByText('Makan').length).toBeGreaterThan(0);
    expect(screen.getByText('Kopi')).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary')
          ? jsonResponse({ month: '2026-10', total: 0, perKategori: {}, targetNabung: null, anggaran: null, sisaAnggaran: null })
          : jsonResponse({ month: '2026-10', page: 1, pageSize: 200, total: 0, items: [] }),
      ),
    );
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByText('Belum ada transaksi.')).toBeInTheDocument());
    expect(screen.getByText('Belum ada pengeluaran tercatat di bulan ini.')).toBeInTheDocument();
  });

  it('downloads the CSV report for the selected month', async () => {
    const createUrl = vi.fn(() => 'blob:fake');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const bodyAppend = vi.spyOn(document.body, 'appendChild');

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/export')) {
          return Promise.resolve({ ok: true, blob: async () => new Blob(['a,b'], { type: 'text/csv' }) });
        }
        return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
      }),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Bulan pengeluaran'), { target: { value: '2026-10' } });
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));

    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    expect(screen.queryByText('Gagal ekspor')).not.toBeInTheDocument();
    const anchor = bodyAppend.mock.calls
      .map((c) => c[0])
      .find((el: Element) => el.tagName === 'A') as HTMLAnchorElement;
    expect(anchor).toBeDefined();
    expect(anchor.download).toBe('expenses-2026-10.csv');
  });

  it('passes the active list filters to the CSV export URL', async () => {
    let capturedUrl = '';
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = String(url);
        if (url.includes('/export')) {
          return Promise.resolve({ ok: true, blob: async () => new Blob(['a,b'], { type: 'text/csv' }) });
        }
        return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
      }),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter kategori'), { target: { value: 'Makan' } });
    fireEvent.change(screen.getByPlaceholderText('Cari transaksi…'), { target: { value: 'warteg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));

    await waitFor(() => expect(capturedUrl).toContain('/export?'));
    expect(capturedUrl).toContain('kategori=Makan');
    expect(capturedUrl).toContain('q=warteg');
  });

  it('downloads the PDF report for the selected month', async () => {
    const createUrl = vi.fn(() => 'blob:fake');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const bodyAppend = vi.spyOn(document.body, 'appendChild');

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/export/pdf')) {
          return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
        }
        return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
      }),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Bulan pengeluaran'), { target: { value: '2026-10' } });
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ekspor PDF' }));

    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    expect(screen.queryByText('Gagal ekspor')).not.toBeInTheDocument();
    const pdfAnchor = bodyAppend.mock.calls
      .map((c) => c[0])
      .find((el: Element) => el.tagName === 'A' && (el as HTMLAnchorElement).download === 'expenses-2026-10.pdf') as HTMLAnchorElement | undefined;
    expect(pdfAnchor).toBeDefined();
    expect(pdfAnchor!.download).toBe('expenses-2026-10.pdf');
  });

  it('surfaces an API error with a retry button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Coba lagi')).toBeInTheDocument();
  });
});

describe('ExpensesView pixel2 chill design', () => {
  it('uses square, hard-shadow control styling on the header actions and pixel heading', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const csv = screen.getByRole('button', { name: 'Ekspor CSV' });
    expect(csv.className).toContain('rounded-none');
    expect(csv.className).toContain('pixel-shadow-sm');

    expect(screen.getByRole('button', { name: 'Ekspor PDF' }).className).toContain('rounded-none');
    expect(screen.getByRole('heading', { name: 'Pengeluaran' }).className).toContain('pixel-heading');
  });

  it('renders the positive budget-remaining state in the sage positive-green register', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    const sisa = screen.getByText('Rp 500.000');
    expect(sisa.className).toContain('text-chill-sage');
  });

  it('renders segmented (not continuous) per-category comparison bars', async () => {
    vi.stubGlobal('fetch', fetchStub());
    const { container } = render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const catSection = container.querySelector('section[aria-label="Total per kategori"]');
    expect(catSection).toBeTruthy();
    const tracks = catSection!.querySelectorAll('div[class*="gap-[3px]"]');
    expect(tracks.length).toBeGreaterThan(0);
    expect([...tracks][0].childElementCount).toBeGreaterThanOrEqual(4);
    // no proportional width-style fill remains anywhere in the category section
    expect(catSection!.querySelector('[style*="width"]')).toBeNull();
  });

  it('shows the decorative pixel2 easter-egg ornament (deep-sea bubble) next to the title', async () => {
    vi.stubGlobal('fetch', fetchStub());
    const { container } = render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const heading = screen.getByRole('heading', { name: 'Pengeluaran' });
    const ornament = heading.parentElement!.querySelector('span[title*="Pixel2"]');
    expect(ornament).toBeTruthy();
    const svg = ornament!.querySelector('svg[aria-hidden="true"]');
    expect(svg).toBeTruthy();
    expect(svg!.className.baseVal || svg!.getAttribute('class')).toContain('text-chill-deepsea');
    // the ornament must stay decorative: hidden from assistive tech
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('opens the add form and POSTs a new expense, then reloads', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 3, tanggal: '2026-10-29', waktu: '10:00', kategori: 'Makan', keterangan: 'Sarapan', nominal: 15000 },
          201,
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const tambah = screen.getByRole('button', { name: 'Tambah' });
    fireEvent.click(tambah);
    expect(screen.getByLabelText('Tambah pengeluaran')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Sarapan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST')!;
    expect(String(post[0])).toContain('/api/expenses');
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body).toMatchObject({ tanggal: '2026-10-29', kategori: 'Makan', nominal: 15000 });
  });

  it('defaults the add form date to today (WIB)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload)),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    expect(screen.getByLabelText('Tanggal')).toHaveValue(wibTodayTest());
  });

  it('accepts an Indonesian thousand-separator in the nominal field', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 4, tanggal: '2026-10-29', waktu: '12:00', kategori: 'Makan', keterangan: 'Warteg', nominal: 20000 },
          201,
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '20.000' } });
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Warteg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST')!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body.nominal).toBe(20000);
  });

  it('jumps the month picker after saving a row dated in a different month', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 9, tanggal: '2026-11-02', waktu: '08:00', kategori: 'Makan', keterangan: 'Kopi', nominal: 15000 },
          201,
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    // Pin the viewed month to October so the cross-month jump is observable.
    fireEvent.change(screen.getByLabelText('Bulan pengeluaran'), { target: { value: '2026-10' } });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('month=2026-10'))).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('month=2026-11'))).toBe(true);
    });
  });

  it('shows an error when saving without an API key', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey={undefined} />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(screen.getByText('API key diperlukan untuk menyimpan pengeluaran.')).toBeInTheDocument(),
    );
  });

  it('opens edit form on Edit click and PUTs the change', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return jsonResponse(
          { id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Transport', keterangan: 'Gojek', nominal: 25000 },
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit Warteg' }));
    expect(screen.getByLabelText('Edit pengeluaran')).toBeInTheDocument();
    expect(screen.getByLabelText('Nominal (Rp)')).toHaveValue('12000');

    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT');
      expect(put).toBeTruthy();
    });
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')!;
    expect(String(put[0])).toContain('/api/expenses/1');
    const body = JSON.parse(String((put[1] as RequestInit).body));
    expect(body.nominal).toBe(25000);
  });

  it('requires confirmation before DELETing a row', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    // First click only arms confirmation — no DELETE is issued yet.
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warteg' }));

    expect(screen.queryByRole('button', { name: 'Hapus Warteg' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yakin hapus Warteg' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false);

    // Second click confirms and deletes.
    fireEvent.click(screen.getByRole('button', { name: 'Yakin hapus Warteg' }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE');
      expect(del).toBeTruthy();
    });
    const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE')!;
    expect(String(del[0])).toContain('/api/expenses/1');
  });

  it('lets the user cancel a pending delete', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warteg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal hapus' }));

    expect(screen.getByRole('button', { name: 'Hapus Warteg' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false);
  });

  it('surfaces a delete failure as a visible alert with the form closed', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response('', { status: 500 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warteg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yakin hapus Warteg' }));

    await waitFor(() =>
      expect(screen.getByText('Gagal menghapus (500).')).toBeInTheDocument(),
    );
  });
  it('refetches the trend chart after adding an expense', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 5, tanggal: '2026-10-29', waktu: '10:00', kategori: 'Makan', keterangan: 'Sarapan', nominal: 15000 },
          201,
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    const trendCount = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/trend')).length;
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    const before = trendCount();

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
    await waitFor(() => expect(trendCount()).toBeGreaterThan(before));
  });

  it('refetches the trend chart after editing an expense', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return jsonResponse(
          { id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Transport', keterangan: 'Gojek', nominal: 25000 },
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    const trendCount = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/trend')).length;
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    const before = trendCount();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Warteg' }));
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT');
      expect(put).toBeTruthy();
    });
    await waitFor(() => expect(trendCount()).toBeGreaterThan(before));
  });

  it('refetches the trend chart after deleting an expense', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    const trendCount = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/trend')).length;
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    const before = trendCount();

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warteg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yakin hapus Warteg' }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE');
      expect(del).toBeTruthy();
    });
    await waitFor(() => expect(trendCount()).toBeGreaterThan(before));
  });

  it('renders the pixel2 surface-texture ornaments (card bevel, corner pixel, divider diamond)', async () => {
    vi.stubGlobal('fetch', fetchStub());
    const { container } = render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    // One bevel strip per summary card (4 cards) - the chunky light edge.
    expect(container.querySelectorAll('.bg-chill-elevated').length).toBeGreaterThanOrEqual(4);
    // The grid-aligned pixel diamond replaces the old rotated square.
    expect(container.querySelector('svg rect')).not.toBeNull();
  });

  it('filters transactions by category', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter kategori'), { target: { value: 'Makan' } });
    expect(screen.getByText('Warteg')).toBeInTheDocument();
    expect(screen.queryByText('Kopi')).not.toBeInTheDocument();
  });

  it('filters transactions by text search', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cari transaksi'), { target: { value: 'kopi' } });
    expect(screen.getByText('Kopi')).toBeInTheDocument();
    expect(screen.queryByText('Warteg')).not.toBeInTheDocument();
  });

  it('shows a no-match state and reset restores all transactions', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Cari transaksi'), { target: { value: 'zzz' } });
    expect(screen.getByText('Tidak ada transaksi yang cocok dengan filter.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));
    expect(screen.getByText('Warteg')).toBeInTheDocument();
    expect(screen.getByText('Kopi')).toBeInTheDocument();
  });
});

describe('ExpensesView per-day spend chart integration', () => {
  it('renders the per-day spend chart section with the daily-budget reference', async () => {
    vi.stubGlobal('fetch', fetchStub());
    const { container } = render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    const section = container.querySelector('section[aria-label="Pengeluaran per hari"]');
    expect(section).toBeTruthy();
    expect(section!.querySelector('[aria-label="Pengeluaran per hari"]')).toBeTruthy();
    expect(screen.getByText(/Garis putus-putus/)).toBeInTheDocument();
  });
});

describe('ExpensesView monthly savings progress', () => {
  it('shows the savings-vs-target block when a target is set', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    expect(screen.getByText('Tabungan bulan ini')).toBeInTheDocument();
    const block = screen.getByText('Tabungan bulan ini').closest('.rounded-none') as HTMLElement;
    expect(block).toBeTruthy();
    // summaryPayload has targetNabung 467000 and no Nabung deposits -> Rp 0.
    expect(block.textContent!.replace(/\s/g, ' ')).toContain('Rp 0 dari Rp 467.000');
  });

  it('renders the actual deposit amount against the target', async () => {
    const savingsPayload = {
      month: '2026-10',
      total: 20000,
      perKategori: { Makan: 12000, Lain: 8000, Nabung: 200000 },
      targetNabung: 467000,
      anggaran: 520000,
      sisaAnggaran: 500000,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary') ? jsonResponse(savingsPayload) : jsonResponse(pagePayload)),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const block = screen.getByText('Tabungan bulan ini').closest('.rounded-none') as HTMLElement;
    expect(block.textContent!.replace(/\s/g, ' ')).toContain('Rp 200.000 dari Rp 467.000');
  });

  it('hides the savings block when no target is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary')
          ? jsonResponse({ month: '2026-10', total: 0, perKategori: {}, targetNabung: null, anggaran: null, sisaAnggaran: null })
          : jsonResponse({ month: '2026-10', page: 1, pageSize: 200, total: 0, items: [] }),
      ),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Belum ada transaksi.')).toBeInTheDocument());
    expect(screen.queryByText('Tabungan bulan ini')).not.toBeInTheDocument();
  });
});

describe('ExpensesView remaining-daily-budget projection', () => {
  const liveMonth = currentMonthKey();

  it('shows the remaining daily budget for the live month', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary')
          ? jsonResponse({
              month: liveMonth,
              total: 220000,
              perKategori: { Makan: 150000, Lain: 70000 },
              targetNabung: 467000,
              anggaran: 500000,
              sisaAnggaran: 280000,
            })
          : jsonResponse(pagePayload),
      ),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Sisa per hari')).toBeInTheDocument());
    const r = remainingDailyBudget(liveMonth, 280000)!;
    const expected = `±${formatRupiah(r.dailyAllowance)} · ${r.daysLeft} hari tersisa`.replace(/\s/g, ' ');
    const line = screen.getByText(/hari tersisa/).textContent!.replace(/\s/g, ' ');
    expect(line).toContain(expected);
  });

  it('hides the projection when no budget is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary')
          ? jsonResponse({ month: liveMonth, total: 220000, perKategori: { Makan: 220000 }, targetNabung: null, anggaran: null, sisaAnggaran: null })
          : jsonResponse(pagePayload),
      ),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    expect(screen.queryByText('Sisa per hari')).not.toBeInTheDocument();
  });
});

describe('ExpensesView all-time sisa cards', () => {
  const sisaPayload = {
    totalPemasukan: 7400000,
    totalPengeluaran: 372000,
    sisaUang: 7028000,
  };

  it('renders the "Dari Gaji" card from the live /sisa total, not a hardcoded literal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/summary')
          ? jsonResponse(summaryPayload)
          : url.includes('/sisa')
            ? jsonResponse(sisaPayload)
            : jsonResponse(pagePayload),
      ),
    );
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Semua Waktu' }));
    await waitFor(() => expect(screen.getByText('Total Pemasukan')).toBeInTheDocument());

    // The card value must be the API-derived rupiah (Rp 7.400.000), proving the
    // card now reads from the ledger instead of a drifting hardcoded "7.4 jt".
    expect(screen.getByText('Dari Gaji')).toBeInTheDocument();
    // formatRupiah emits a non-breaking space (U+00A0) between "Rp" and the
    // amount, so match on normalized whitespace (see expenses pitfall).
    // Both "Total Pemasukan" and "Dari Gaji" cards now read the same live value.
    expect(screen.getAllByText((_, el) => el?.textContent?.replace(/\s/g, ' ') === formatRupiah(sisaPayload.totalPemasukan).replace(/\s/g, ' ')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('7.4 jt')).not.toBeInTheDocument();
  });
});

describe('ExpensesView success feedback', () => {
  it('shows a transient confirmation after adding an expense', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 9, tanggal: '2026-10-29', waktu: '11:00', kategori: 'Makan', keterangan: 'Snack', nominal: 5000 },
          201,
        );
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(screen.getByText('Pengeluaran tersimpan.')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Pengeluaran tersimpan.');
  });

  it('shows a transient confirmation after deleting an expense', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Warteg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yakin hapus Warteg' }));

    await waitFor(() => expect(screen.getByText('Pengeluaran dihapus.')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Pengeluaran dihapus.');
  });
});

describe('ExpensesView transaction-row micro-interaction', () => {
  it('each transaction row carries the hover surface tone + transition (pixel language)', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    const section = screen.getByLabelText('Daftar transaksi');
    const rows = section.querySelectorAll('li');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.className).toContain('transition');
      expect(row.className).toContain('hover:bg-chill-elevated');
    });
  });
});

describe('ExpensesView duplicate-entry guard', () => {
  const dupItems: ExpenseItem[] = [
    { id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 },
    { id: 2, tanggal: '2026-10-27', waktu: '09:00', kategori: 'Lain', keterangan: 'Kopi', nominal: 8000 },
  ];

  function dupPagePayload() {
    return { month: '2026-10', page: 1, pageSize: 200, total: 2, items: dupItems };
  }

  it('warns before saving an exact duplicate and does not POST until confirmed', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 3, tanggal: '2026-10-28', waktu: '', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 },
          201,
        );
      }
      return String(url).includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(dupPagePayload());
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-28' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Warteg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText(/Entri serupa sudah ada/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Simpan tetap' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST')!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body).toMatchObject({ tanggal: '2026-10-28', kategori: 'Makan', nominal: 12000 });
  });

  it('lets the user cancel a duplicate warning without saving', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 4, tanggal: '2026-10-28', waktu: '', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 },
          201,
        );
      }
      return String(url).includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(dupPagePayload());
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-28' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Warteg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Batal' }));

    expect(screen.queryByText(/Entri serupa sudah ada/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'POST')).toBe(false);
    // The add form stays open so the user can edit the entry.
    expect(screen.getByLabelText('Tambah pengeluaran')).toBeInTheDocument();
  });

  it('does not warn when the payload differs from every existing row', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          { id: 5, tanggal: '2026-10-29', waktu: '', kategori: 'Makan', keterangan: 'Makan siang', nominal: 20000 },
          201,
        );
      }
      return String(url).includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(dupPagePayload());
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);
    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    fireEvent.change(screen.getByLabelText('Tanggal'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Makan siang' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
    expect(screen.queryByText(/Entri serupa sudah ada/)).not.toBeInTheDocument();
  });
});

describe('findDuplicateExpense', () => {
  const rows: ExpenseItem[] = [
    { id: 1, tanggal: '2026-10-28', waktu: '12:30', kategori: 'Makan', keterangan: '  Warteg  ', nominal: 12000 },
    { id: 2, tanggal: '2026-10-27', waktu: '09:00', kategori: 'Lain', keterangan: 'Kopi', nominal: 8000 },
  ];

  it('matches an exact duplicate by date/kategori/nominal/normalized keterangan', () => {
    const found = findDuplicateExpense(
      { tanggal: '2026-10-28', kategori: 'Makan', keterangan: 'warteg', nominal: 12000 },
      rows,
    );
    expect(found?.id).toBe(1);
  });

  it('ignores a difference in any field', () => {
    expect(findDuplicateExpense({ tanggal: '2026-10-28', kategori: 'Makan', keterangan: 'Warteg', nominal: 13000 }, rows)).toBeNull();
    expect(findDuplicateExpense({ tanggal: '2026-10-29', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 }, rows)).toBeNull();
    expect(findDuplicateExpense({ tanggal: '2026-10-28', kategori: 'Transport', keterangan: 'Warteg', nominal: 12000 }, rows)).toBeNull();
  });

  it('never flags a row against itself via excludeId', () => {
    const p = { tanggal: '2026-10-28', kategori: 'Makan', keterangan: 'Warteg', nominal: 12000 };
    expect(findDuplicateExpense(p, rows, 1)).toBeNull();
    expect(findDuplicateExpense(p, rows, 2)).toEqual(rows[0]);
  });
});

describe('ExpensesView — Hari ini figure', () => {
  it('shows today\'s discretionary spend vs today\'s budget, excluding Nabung/Tagihan', async () => {
    const month = currentMonthKey();
    const today = wibTodayTest();
    const summary = {
      month,
      total: 30000,
      perKategori: { Makan: 15000, Nabung: 50000 },
      targetNabung: 467000,
      anggaran: 520000,
      sisaAnggaran: 500000,
    };
    const page = {
      month,
      page: 1,
      pageSize: 200,
      total: 3,
      items: [
        { id: 1, tanggal: today, waktu: '12:30', kategori: 'Makan', keterangan: 'Warteg', nominal: 15000 },
        { id: 2, tanggal: today, waktu: '20:00', kategori: 'Nabung', keterangan: 'Tabungan', nominal: 50000 },
        { id: 3, tanggal: today, waktu: '08:00', kategori: 'Tagihan', keterangan: 'Sewa', nominal: 1300000 },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('/summary') ? jsonResponse(summary) : jsonResponse(page))),
    );
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByText('Hari ini')).toBeInTheDocument());
    // Read the whole "Sisa per hari" box and assert on its text — the id-ID
    // currency formatter uses non-breaking spaces, so exact-string matchers are
    // brittle; substring assertions are stable.
    const todayBox = screen.getByText('Hari ini').closest('div.pixel-shadow-sm') ?? screen.getByText('Hari ini').closest('div');
    expect(todayBox?.textContent).toContain('15.000'); // only the Makan row counts
    expect(todayBox?.textContent).toContain('17.333'); // 520000 / 30 hari
    // Nabung (Rp50k) and Tagihan (Rp1.3jt) must be excluded from today's spend.
    expect(todayBox?.textContent).not.toContain('65.000');
    expect(todayBox?.textContent).not.toContain('1.365.000');
  });

  it('renders no today figure when the month has no budget set', async () => {
    const month = currentMonthKey();
    const today = wibTodayTest();
    const summary = {
      month,
      total: 20000,
      perKategori: { Makan: 20000 },
      targetNabung: null,
      anggaran: null,
      sisaAnggaran: null,
    };
    const page = {
      month,
      page: 1,
      pageSize: 200,
      total: 1,
      items: [{ id: 1, tanggal: today, waktu: '', kategori: 'Makan', keterangan: 'X', nominal: 20000 }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('/summary') ? jsonResponse(summary) : jsonResponse(page))),
    );
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    expect(screen.queryByText('Hari ini')).not.toBeInTheDocument();
  });
});


describe('ExpensesView budget editor', () => {
  it('opens prefilled, saves changes via PUT and reloads', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/target') && init?.method === 'PUT') {
        return jsonResponse({ month: currentMonthKey(), anggaran: 300000, targetNabung: 150000 });
      }
      return url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Atur anggaran' }));

    const anggaranInput = screen.getByLabelText('Anggaran') as HTMLInputElement;
    const nabungInput = screen.getByLabelText('Target Nabung') as HTMLInputElement;
    expect(anggaranInput.value).toBe('520000');
    expect(nabungInput.value).toBe('467000');

    fireEvent.change(anggaranInput, { target: { value: '300000' } });
    fireEvent.change(nabungInput, { target: { value: '150000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/target') && (c[1] as RequestInit)?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(String((putCall![1] as RequestInit).body))).toEqual({
        month: currentMonthKey(),
        anggaran: 300000,
        targetNabung: 150000,
      }, { timeout: 5000 });
    }, { timeout: 5000 });
  });

  it('shows a validation error for a negative budget', async () => {
    const fetchMock = vi.fn((url: string) =>
      url.includes('/summary') ? jsonResponse(summaryPayload) : jsonResponse(pagePayload),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByText('Total Pengeluaran')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Atur anggaran' }));
    fireEvent.change(screen.getByLabelText('Anggaran'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Anggaran harus bilangan bulat ≥ 0.')).toBeInTheDocument();
    // No PUT should have been issued for a validation failure.
    const putCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/target') && (c[1] as RequestInit)?.method === 'PUT',
    );
    expect(putCall).toBeUndefined();
  });
});
