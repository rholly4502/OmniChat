import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('surfaces an API error with a retry button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<ExpensesView apiKey="secret" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Coba lagi')).toBeInTheDocument();
  });
});
