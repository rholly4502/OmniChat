import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ExpensesView } from '../components/ExpensesView';

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
    expect(screen.getByText('Rp 20.000')).toBeInTheDocument();
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
});
