import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SummaryView } from '../components/SummaryView';
import { currentMonthKey } from '../hooks/useExpenses';

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

function fetchStub() {
  return vi.fn((url: string) => {
    if (url.includes('/summary')) return jsonResponse(summaryPayload);
    if (url.includes('/jobs')) return jsonResponse([]); // listOpportunities -> Opportunity[]
    if (url.includes('/events')) return jsonResponse([]); // listEvents -> PromoEvent[]
    return jsonResponse(pagePayload);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SummaryView', () => {
  it('renders the four summary cards', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 12, totalTokens: 345000, byModel: { 'hermes-agent': 345000 } }} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ringkasan' })).toBeInTheDocument());
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument();
    expect(screen.getByText('Lowongan')).toBeInTheDocument();
    expect(screen.getByText('Promo / Event')).toBeInTheDocument();
  });

  it('shows usage numbers from the summary prop', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 7, totalTokens: 12000, byModel: { a: 6000, b: 6000 } }} />);

    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    // 12.000 dengan locale id-ID
    expect(screen.getAllByText('12.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2')).toBeInTheDocument(); // model aktif
  });
});
