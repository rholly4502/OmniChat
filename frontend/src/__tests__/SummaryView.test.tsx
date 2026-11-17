import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  totalNabungKumulatif: 1250000,
};

const pagePayload = {
  month: currentMonthKey(new Date()),
  page: 1,
  pageSize: 200,
  total: 0,
  items: [],
};

const defaultJobsSummary = {
  perStatus: { new: 0, applied: 0, interview: 0, offer: 0, closed: 0 },
  total: 0,
  followUpTerlambat: 0,
  followUpHariIni: 0,
  followUp7Hari: 0,
};

const defaultEventsSummary = {
  total: 0,
  sumberUnik: 0,
  berakhirHariIni: 0,
  besokBerakhir: 0,
  dalam7Hari: 0,
  sudahBerakhir: 0,
};

function fetchStub(overrides: {
  summary?: Response | typeof summaryPayload;
  jobsSummary?: Response | typeof defaultJobsSummary;
  eventsSummary?: Response | typeof defaultEventsSummary;
  trend?: unknown;
} = {}) {
  return vi.fn((url: string) => {
    if (url.includes('/jobs/summary')) {
      const v = overrides.jobsSummary;
      return v instanceof Response ? v : jsonResponse(v ?? defaultJobsSummary);
    }
    if (url.includes('/events/summary')) {
      const v = overrides.eventsSummary;
      return v instanceof Response ? v : jsonResponse(v ?? defaultEventsSummary);
    }
    if (url.includes('/trend')) {
      const v = overrides.trend;
      return v instanceof Response ? v : jsonResponse(v ?? { months: 6, points: [] });
    }
    if (url.includes('/summary')) {
      const v = overrides.summary;
      return v instanceof Response ? v : jsonResponse(v ?? summaryPayload);
    }
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
    const jobsSummary = {
      perStatus: { new: 2, applied: 1, interview: 3, offer: 1, closed: 2 },
      total: 9,
      followUpTerlambat: 0,
      followUpHariIni: 0,
      followUp7Hari: 0,
    };
    vi.stubGlobal('fetch', fetchStub({ jobsSummary }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Lowongan')).toBeInTheDocument());
    // aktif = semua kecuali closed (9 - 2 = 7)
    expect(screen.getByText('Aktif (belum tutup)').parentElement).toHaveTextContent('7');
    expect(screen.getByText('Baru').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Sudah dilamar').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Interview').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Tawaran').parentElement).toHaveTextContent('1');
  });

  it('counts overdue follow-ups among active pipeline stages', async () => {
    // Hanya stage aktif yang dihitung: terlambat (2) + hari ini (0) = 2.
    const jobsSummary = {
      perStatus: { new: 1, applied: 2, interview: 1, closed: 1, offer: 1 },
      total: 6,
      followUpTerlambat: 2,
      followUpHariIni: 0,
      followUp7Hari: 0,
    };
    vi.stubGlobal('fetch', fetchStub({ jobsSummary }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Lowongan')).toBeInTheDocument());
    expect(screen.getByText('Perlu follow-up').parentElement).toHaveTextContent('2');
  });

  it('counts total events and unique sources from the summary endpoint', async () => {
    const eventsSummary = { total: 5, sumberUnik: 2, berakhirHariIni: 0, besokBerakhir: 0, dalam7Hari: 0, sudahBerakhir: 0 };
    vi.stubGlobal('fetch', fetchStub({ eventsSummary }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.getByText('Total terdokumentasi').parentElement).toHaveTextContent('5');
    expect(screen.getByText('Sumber unik').parentElement).toHaveTextContent('2');
  });

  it('shows the already-expired promo count when stale promos exist', async () => {
    vi.stubGlobal('fetch', fetchStub({ eventsSummary: { total: 4, sumberUnik: 2, berakhirHariIni: 0, besokBerakhir: 0, dalam7Hari: 0, sudahBerakhir: 3 } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.getByText('Sudah berakhir').parentElement).toHaveTextContent('3');
  });

  it('hides the already-expired row when there are no stale promos', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.queryByText('Sudah berakhir')).not.toBeInTheDocument();
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

  it('shows the per-category spending breakdown on the expenses card', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Pengeluaran per kategori')).toBeInTheDocument();
    expect(screen.getByText('Makan')).toBeInTheDocument();
    expect(screen.getByText('Lain')).toBeInTheDocument();
  });

  it('excludes Nabung savings from the per-category spending breakdown', async () => {
    vi.stubGlobal('fetch', fetchStub({ summary: { ...summaryPayload, perKategori: { Makan: 12000, Lain: 8000, Nabung: 500000 } } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Makan')).toBeInTheDocument();
    expect(screen.getByText('Lain')).toBeInTheDocument();
    expect(screen.queryByText('Nabung')).not.toBeInTheDocument();
  });

  it('shows monthly savings and progress toward the nabung target', async () => {
    vi.stubGlobal('fetch', fetchStub({ summary: { ...summaryPayload, perKategori: { Makan: 12000, Lain: 8000, Nabung: 500000 }, targetNabung: 1000000 } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Ditabung bulan ini').parentElement).toHaveTextContent('500.000');
    expect(screen.getByText('Progres nabung')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows the cumulative savings pot (dana PC terkumpul)', async () => {
    vi.stubGlobal('fetch', fetchStub({ summary: { ...summaryPayload, totalNabungKumulatif: 1250000 } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Dana PC terkumpul').parentElement).toHaveTextContent('1.250.000');
  });

  it('hides the nabung progress when no target is set', async () => {
    vi.stubGlobal('fetch', fetchStub({ summary: { ...summaryPayload, perKategori: { Makan: 12000, Lain: 8000, Nabung: 500000 }, targetNabung: 0 } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Ditabung bulan ini').parentElement).toHaveTextContent('500.000');
    expect(screen.queryByText('Progres nabung')).not.toBeInTheDocument();
  });

  it('hides the Model aktif row when byModel is empty', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 3, totalTokens: 5000, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument());
    expect(screen.queryByText('Model aktif')).not.toBeInTheDocument();
  });

  it('shows an alert with retry when the expenses summary endpoint fails', async () => {
    const fetchMock = fetchStub({ summary: jsonResponse({ message: 'Boom' }, 500) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Gagal memuat sebagian data');
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeInTheDocument();
  });

  it('recovers after a failed load when retry is clicked', async () => {
    let calls = 0;
    const fetchMock = vi.fn((url: string) => {
      calls += 1;
      if (calls === 1 && url.includes('/api/expenses')) return jsonResponse({ message: 'Boom' }, 500);
      if (url.includes('/events/summary')) return jsonResponse(defaultEventsSummary);
      if (url.includes('/jobs/summary')) return jsonResponse(defaultJobsSummary);
      if (url.includes('/summary')) return jsonResponse(summaryPayload);
      return jsonResponse(pagePayload);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' })));
    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the Perlu follow-up stat as a button and triggers navigation when clicked', async () => {
    const onOpenFollowUps = vi.fn();
    vi.stubGlobal('fetch', fetchStub());
    render(
      <SummaryView
        apiKey="secret"
        usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }}
        onOpenFollowUps={onOpenFollowUps}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ringkasan' })).toBeInTheDocument());
    const followUpBtn = screen.getByRole('button', { name: /Perlu follow-up/ });
    expect(followUpBtn).toBeInTheDocument();
    fireEvent.click(followUpBtn);
    expect(onOpenFollowUps).toHaveBeenCalledTimes(1);
  });

  it('counts upcoming follow-ups split into today and next 7 days', async () => {
    const jobsSummary = {
      perStatus: { new: 1, applied: 2, interview: 1, closed: 1, offer: 1 },
      total: 6,
      followUpTerlambat: 0,
      followUpHariIni: 1,
      followUp7Hari: 2,
    };
    vi.stubGlobal('fetch', fetchStub({ jobsSummary }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Lowongan')).toBeInTheDocument());
    expect(screen.getByText('Follow-up hari ini').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Dalam 7 hari').parentElement).toHaveTextContent('2');
  });

  it('shows promo expiry urgency buckets from the summary endpoint', async () => {
    const eventsSummary = { total: 5, sumberUnik: 2, berakhirHariIni: 1, besokBerakhir: 1, dalam7Hari: 1, sudahBerakhir: 0 };
    vi.stubGlobal('fetch', fetchStub({ eventsSummary }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    const card = within(screen.getByRole('heading', { name: 'Promo / Event' }).closest('section') as HTMLElement);
    expect(card.getByText('Berakhir hari ini').parentElement).toHaveTextContent('1');
    expect(card.getByText('Besok berakhir').parentElement).toHaveTextContent('1');
    expect(card.getByText('Dalam 7 hari').parentElement).toHaveTextContent('1');
  });

  it('hides promo expiry rows when nothing expires within 7 days', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.getByText('Sumber unik')).toBeInTheDocument();
    expect(screen.queryByText('Berakhir hari ini')).not.toBeInTheDocument();
    expect(screen.queryByText('Besok berakhir')).not.toBeInTheDocument();
  });

  it('renders the Lihat semua promo button and triggers navigation when clicked', async () => {
    const onOpenEvents = vi.fn();
    const eventsSummary = { total: 3, sumberUnik: 1, berakhirHariIni: 1, besokBerakhir: 0, dalam7Hari: 0, sudahBerakhir: 2 };
    vi.stubGlobal('fetch', fetchStub({ eventsSummary }));
    render(
      <SummaryView
        apiKey="secret"
        usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }}
        onOpenEvents={onOpenEvents}
      />,
    );

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    const eventsBtn = screen.getByRole('button', { name: /Lihat semua promo/ });
    expect(eventsBtn).toBeInTheDocument();
    fireEvent.click(eventsBtn);
    expect(onOpenEvents).toHaveBeenCalledTimes(1);
  });

  it('omits the Lihat semua promo button when onOpenEvents is not passed', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Promo / Event')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Lihat semua promo/ })).not.toBeInTheDocument();
  });

  it('shows the month-over-month spend change from the trend endpoint', async () => {
    const month = currentMonthKey(new Date());
    const [y, m] = month.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    vi.stubGlobal('fetch', fetchStub({ trend: { months: 6, points: [
      { month: prev, total: 12000 },
      { month, total: 20000 },
    ] } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Dibanding bulan lalu')).toBeInTheDocument());
    // 20.000 − 12.000 = 8.000 (locale id-ID), dinaikkan dengan tanda +
    expect(screen.getByText('+8.000')).toBeInTheDocument();
  });

  it('hides the month-over-month row when there is no prior month in the trend', async () => {
    const month = currentMonthKey(new Date());
    vi.stubGlobal('fetch', fetchStub({ trend: { months: 6, points: [
      { month, total: 20000 },
    ] } }));
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.queryByText('Dibanding bulan lalu')).not.toBeInTheDocument();
  });

  it('shows the monthly budget ceiling on the expenses card', async () => {
    vi.stubGlobal('fetch', fetchStub());
    render(<SummaryView apiKey="secret" usageSummary={{ conversationCount: 0, totalTokens: 0, byModel: {} }} />);

    await waitFor(() => expect(screen.getByText('Pengeluaran (bulan ini)')).toBeInTheDocument());
    expect(screen.getByText('Anggaran').parentElement).toHaveTextContent('520.000');
  });

});
