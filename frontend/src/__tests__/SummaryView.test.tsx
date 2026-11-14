import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SummaryView } from '../components/SummaryView';
import { currentMonthKey } from '../hooks/useExpenses';
import type { Opportunity } from '../jobsApi';
import type { PromoEvent } from '../eventsApi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summaryPayload = {
  month: currentMonthKey(new Date()),
  total: 20000,
  perKategori: { Makan: 12000, Lain: 8000 },
  targetNabung: 467000,
  anggaran: 520000,
  sisaAnggaran: 500000,
};

const pagePayload = {
  month: currentMonthKey(new Date()),
  page: 1,
  pageSize: 200,
  total: 0,
  items: [],
};

function jobOf(id: number, status: string): Opportunity {
  return {
    id,
    judul: `Job ${id}`,
    perusahaan: 'Astra',
    lokasi: 'Jakarta',
    tipe: 'fulltime',
    status,
    ditemukan: '2026-11-01',
  };
}

function eventOf(id: number, aplikasi: string): PromoEvent {
  return {
    id,
    aplikasi,
    judul: `Event ${id}`,
    ditemukan: '2026-11-01',
  };
}

function fetchStub(overrides: { summary?: unknown; jobs?: unknown; events?: unknown } = {}) {
  return vi.fn((url: string) => {
    if (url.includes('/summary')) return jsonResponse(overrides.summary ?? summaryPayload);
    if (url.includes('/jobs')) return jsonResponse(overrides.jobs ?? []);
    if (url.includes('/events')) return jsonResponse(overrides.events ?? []);
    return jsonResponse(pagePayload);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SummaryView', () => {
  it('renders the four summary cards', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(
      <SummaryView
        apiKey="secret"
        usageSummary={{ conversationCount: 12, totalTokens: 345000, byModel: { 'hermes-agent': 345000 } }}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ringkasan' })).toBeInTheDocument());
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument();
    expect(screen.getByText('Lowongan')).toBeInTheDocument();
    expect(screen.getByText('Promo / Event')).toBeInTheDocument();
  });

  it('shows usage numbers from the summary prop', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(
      <SummaryView apiKey="secret" usageSummary={{ conversationCount: 7, totalTokens: 12000, byModel: { a: 6000, b: 6000 } }} />,
    );

    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    // 12.000 dengan locale id-ID
    expect(screen.getAllByText('12.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2')).toBeInTheDocument(); // model aktif
  });

  it('counts job pipeline statuses and excludes closed from aktif', async () => {
    const jobs: Opportunity[] = [
      jobOf(1, 'new'),
      jobOf(2, 'new'),
      jobOf(3, 'applied'),
      jobOf(4, 'interview'),
      jobOf(5, 'interview'),
      jobOf(6, 'interview'),
      jobOf(7, 'offer'),
      jobOf(8, 'closed'),
      jobOf(9, 'closed'),
    ];
    vi.stubGlobal('fetch', fetchStub({ jobs }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Lowongan')).toBeInTheDocument());
    // aktif = semua kecuali closed (9 - 2 = 7)
    expect(screen.getByText('Aktif (belum tutup)').parentElement).toHaveTextContent('7');
    expect(screen.getByText('Baru').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Sudah dilamar').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Interview').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Tawaran').parentElement).toHaveTextContent('1');
  });

  it('counts unique event sources', async () => {
    const events: PromoEvent[] = [
      eventOf(1, 'OVO'),
      eventOf(2, 'OVO'),
      eventOf(3, 'GoPay'),
      eventOf(4, 'GoPay'),
      eventOf(5, 'GoPay'),
    ];
    vi.stubGlobal('fetch', fetchStub({ events }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.getByText('Total terdokumentasi').parentElement).toHaveTextContent('5');
    expect(screen.getByText('Sumber unik').parentElement).toHaveTextContent('2');
  });

  it('marks the expenses card red when the allowance is negative', async () => {
    vi.stubGlobal('fetch', fetchStub({ summary: { ...summaryPayload, sisaAnggaran: -50000 } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    // sisa anggaran negatif diformat dengan locale id-ID
    expect(screen.getByText('-50.000').parentElement).toHaveTextContent('-50.000');
    // glyph kartu memperoleh tone merah
    const card = screen.getByRole('heading', { name: 'Pengeluaran (bulan ini)' }).closest('section');
    expect(card?.innerHTML ?? '').toContain('text-red-400');
  });

  it('hides the Model aktif row when byModel is empty', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 3, totalTokens: 5000, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument());
    expect(screen.queryByText('Model aktif')).not.toBeInTheDocument();
  });
});
