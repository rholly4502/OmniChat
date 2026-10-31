import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdvicePanel } from '../components/AdvicePanel';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const advicePayload = {
  date: '2026-05-31',
  month: '2026-05',
  dayTotal: 320000,
  dailyBudget: 16774,
  status: 'over_budget',
  overBy: 303226,
  suggestions: ['Ganti minuman manis dengan air putih.'],
  categoryTrend: [
    { kategori: 'Belanja', total: 300000 },
    { kategori: 'Makan', total: 20000 },
  ],
  projection: { spentSoFar: 320000, daysElapsed: 31, daysInMonth: 31, projectedTotal: 320000, anggaran: 520000, projectedOver: 0 },
  pcGoal: {
    parts: [
      { name: 'VGA', price: 3500000 },
      { name: 'CPU', price: 2800000 },
    ],
    totalNeeded: 8700000,
    nabungSoFar: 0,
    percentCollected: 0,
    remaining: 8700000,
    potentialSavingPerMonth: 200000,
    monthsToReach: 44,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdvicePanel', () => {
  it('expands, fetches advice and renders the over-budget report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));

    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());
    expect(screen.getByText('Ganti minuman manis dengan air putih.')).toBeInTheDocument();
    expect(screen.getByText('Belanja')).toBeInTheDocument();
    expect(screen.getByText('Goal: Part PC')).toBeInTheDocument();
    expect(screen.getByText('VGA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tutup' })).toBeInTheDocument();
  });

  it('shows a message when no API key is provided', async () => {
    render(<AdvicePanel apiKey={undefined} month="2026-05" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));

    expect(await screen.findByText('API key diperlukan untuk Analisa & Saran.')).toBeInTheDocument();
  });

  it('surfaces a 401 API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));

    expect(await screen.findByText('Gagal memuat analisa (401).')).toBeInTheDocument();
  });
});
