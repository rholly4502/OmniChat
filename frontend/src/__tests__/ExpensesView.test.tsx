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
});

