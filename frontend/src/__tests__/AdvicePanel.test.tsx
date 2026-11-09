import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdvicePanel } from '../components/AdvicePanel';
import { analyseDate } from '../adviceDate';

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
  pace: {
    currentMonth: '2026-05',
    day: 31,
    currentThroughDay: 320000,
    previousMonth: '2026-04',
    previousThroughDay: 250000,
    delta: 70000,
    percentChange: 28.0,
  },
  remainingAllowance: {
    anggaran: 520000,
    spentSoFar: 320000,
    remainingBudget: 200000,
    daysLeft: 1,
    perDayAllowance: 200000,
  },
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
  daily: {
    sarapan: 'Oatmeal + pisang + teh tawar',
    makanSiang: 'Nasi, ayam bakar, tumis kangkung, air putih',
    makanMalam: 'Nasi, telur dadar, sayur bening bayam',
    biaya: '±Rp25–30k',
    foodSpend: 20000,
    biayaMin: 25000,
    biayaMax: 30000,
    aktivitas: 'Jalan kaki 10.000 langkah',
    funFact: 'Otak butuh ±20% energi tubuh',
    tipAnakKos: 'Masak sendiri: belanja bahan seminggu sekali',
  },
  monthlyNabung: {
    target: 3100000,
    collectedThisMonth: 800000,
    percentCollected: 25.8,
    remaining: 2300000,
    projectedSavings: 0,
    projectedDeficit: 3100000,
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
    expect(screen.getByText('Saran Harian · 2026-05-31')).toBeInTheDocument();
    expect(screen.getByText('Oatmeal + pisang + teh tawar')).toBeInTheDocument();
    expect(screen.getByText('Tahukah kamu?')).toBeInTheDocument();
    expect(screen.getByText('Tips anak kos')).toBeInTheDocument();
    expect(screen.getByText('Progres Nabung Bulan Ini')).toBeInTheDocument();
    expect(screen.getByText(/dari target/)).toBeInTheDocument();
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


describe('AdvicePanel pixel2 chill design', () => {
  it('renders in the chill register (square edges, hard offset shadow, pixel heading)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    const { container } = render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const panel = container.querySelector('section[aria-label="Analisa dan Saran"]');
    expect(panel?.className).toContain('rounded-none');
    expect(panel?.className).toContain('pixel-shadow');
    expect(panel?.querySelector('h3')?.className).toContain('pixel-heading');
  });

  it('keeps the decorative easter-egg accents (deep sea + sage) subtle and aria-hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const diver = screen.getByTitle('Dave the Diver: dive the monthly trend 🐠');
    expect(diver.querySelector('svg[aria-hidden]')).toBeTruthy();
    expect(diver.querySelector('svg')?.getAttribute('class')).toContain('text-chill-deepsea');

    const sprout = screen.getByTitle('Stardew Valley: keep harvesting your savings 🌱');
    expect(sprout.querySelector('svg[aria-hidden]')).toBeTruthy();
    expect(sprout.querySelector('svg')?.getAttribute('class')).toContain('text-chill-sage');
  });

  it('wires the disclosure toggle to the body (aria-controls) and renders trend rows as pixel segmented bars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    const { container } = render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: 'Tutup' });
    expect(toggle.getAttribute('aria-controls')).toBe('advice-body');

    const body = container.querySelector('#advice-body');
    expect(body).toBeTruthy();
    const bars = body!.querySelectorAll('div[class*="gap-[3px]"]');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the status callout on the shared hard-edge bevel meter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const callout = screen.getByText(/Over budget/).closest('div.relative');
    expect(callout?.className).toContain('rounded-none');
    expect(callout?.className).toContain('border-chill-red/40');
    // hard chunky 2px top-edge bevel strip is present
    expect(callout?.querySelector('div.absolute')).toBeTruthy();
  });

  it('frames the end-of-month projection as a tone-aware callout (glance budget)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Proyeksi akhir bulan')).toBeInTheDocument();
    const frame = screen.getByText('Proyeksi akhir bulan').closest('div.relative') as HTMLElement;
    // the projection now sits in a framed sub-block on the shared hard-edge bevel grammar
    expect(frame.className).toContain('rounded-none');
    expect(frame.className).toContain('border-chill-border');
    expect(frame.querySelectorAll('div.absolute').length).toBeGreaterThanOrEqual(3);
    // the headline total is emphasised and tone-aware (accent when not over budget)
    const emphasized = [...frame.querySelectorAll('span')].find((s) => s.className.includes('text-sm font-semibold'));
    expect(emphasized).toBeTruthy();
    expect(emphasized!.className).toContain('text-chill-accent');
    expect(emphasized!.textContent!.replace(/\s/g, ' ')).toContain('320.000');
  });

  it('keeps the header row wrapping on narrow screens (responsive consistency)', () => {
    const { container } = render(<AdvicePanel apiKey="secret" month="2026-05" />);
    const panel = container.querySelector('section[aria-label="Analisa dan Saran"]');
    const outer = panel?.querySelector('h3')?.parentElement?.parentElement as HTMLElement | null;
    expect(outer?.className).toContain('flex-wrap');
    expect(outer?.className).toContain('gap-y-2');
  });
});

describe('AdvicePanel daily suggestions (P1-6)', () => {
  it('renders all six rotating daily sections from the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Sarapan')).toBeInTheDocument();
    expect(screen.getByText('Makan siang')).toBeInTheDocument();
    expect(screen.getByText('Makan malam')).toBeInTheDocument();
    expect(screen.getByText('Aktivitas')).toBeInTheDocument();
    expect(screen.getByText('Tahukah kamu?')).toBeInTheDocument();
    expect(screen.getByText('Tips anak kos')).toBeInTheDocument();
    expect(screen.getByText('Nasi, ayam bakar, tumis kangkung, air putih')).toBeInTheDocument();
    expect(screen.getByText('Jalan kaki 10.000 langkah')).toBeInTheDocument();
    expect(screen.getByText('Otak butuh ±20% energi tubuh')).toBeInTheDocument();
    expect(screen.getByText('Masak sendiri: belanja bahan seminggu sekali')).toBeInTheDocument();
    const costLine = screen.getByText(/Estimasi biaya menu hari ini/);
    expect(costLine.textContent).toContain('±Rp25–30k');
    expect(costLine.textContent?.replace(/\s/g, ' ')).toContain('16.774'); // formatRupiah emits NBSP between 'Rp' and the amount
  });

  it('keeps the daily block on the chill pixel register (hard edges, pixel heading)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    const { container } = render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const h = screen.getByText('Saran Harian · 2026-05-31');
    expect(h.className).toContain('pixel-heading');
    expect(h.closest('div.rounded-none')).toBeTruthy();
    expect(container.querySelectorAll('div[class*="border-chill-border"]').length).toBeGreaterThan(0);
  });

  it('flags when the day food food spend has run past the frugal menu plan', async () => {
    const overPayload = {
      ...advicePayload,
      daily: { ...advicePayload.daily, foodSpend: 45000, biayaMax: 30000 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(overPayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const overage = screen.getByText(/melebihi rencana hemat/);
    expect(overage.textContent?.replace(/\s/g, ' ')).toContain('15.000'); // 45.000 - 30.000
    expect(overage.closest('div.rounded-none')).toBeTruthy();
  });

  it('confirms the day food spend is within the frugal menu plan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const withinPlan = screen.getByText(/masih dalam rencana hemat/);
    expect(withinPlan).toBeInTheDocument();
    // The in-allowance state is framed as a sage callout — mirroring the
    // sibling over-budget callout so the two states share one chiseled frame
    // register (rounded-none + hard top/left bevel, warm palette, no glow).
    expect(withinPlan.closest('div.rounded-none')).toBeTruthy();
    expect(withinPlan.closest('div[class*="border-chill-sage"]')).toBeTruthy();
    expect(screen.queryByText(/melebihi rencana hemat/)).not.toBeInTheDocument();
  });

  it('shows no food comparison when no food spend is recorded for the day', async () => {
    const zeroPayload = { ...advicePayload, daily: { ...advicePayload.daily, foodSpend: 0 } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(zeroPayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.queryByText(/Hari ini sudah tercatat/)).not.toBeInTheDocument();
  });
});



describe('AdvicePanel category-trend icons (shared categoryIcons)', () => {
  it('renders a pixel category icon beside every trend row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    const { container } = render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    // Every trend row ("Pola pengeluaran") now carries the shared pixel glyph
    // beside its category name — same icon language as the expenses page.
    const rows = [...container.querySelectorAll('li')].filter((li) =>
      li.textContent?.includes('Belanja') || li.textContent?.includes('Makan'),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.querySelector('svg[aria-hidden]')).toBeTruthy();
    }
  });
});

describe('AdvicePanel projection meter (Design Loop)', () => {
  it('renders the pixel projection gauge and keeps the segmented meter register', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Proyeksi akhir bulan')).toBeInTheDocument();
    // Projected total rendered via the shared rupiah formatter, now inside the
    // framed headline-number callout (total + "/ anggaran" split across two spans).
    const proj = screen.getByText('Proyeksi akhir bulan').closest('div.relative') as HTMLElement;
    const normalized = proj.textContent!.replace(/\s/g, ' ');
    expect(normalized).toContain('Rp 320.000');
    expect(normalized).toContain('/ Rp 520.000');

    // Trend rows (2) + projection meter = a segmented pixel bar per metric.
    const bars = document.querySelectorAll('div[class*="gap-[3px]"]');
    expect(bars.length).toBeGreaterThanOrEqual(3);
  });
});
describe('AdvicePanel month-over-month pace (Design Loop)', () => {
  it('renders the spend-pace comparison with a "lebih besar" delta when ahead of last month', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Bandingkan dengan bulan lalu')).toBeInTheDocument();
    expect(screen.getByText('2026-04')).toBeInTheDocument();
    const label = screen.getByText(/Lebih besar/);
    expect(label.textContent!.replace(/\s/g, ' ')).toContain('Rp 70.000');
    expect(label.textContent!.replace(/\s/g, ' ')).toContain('(28%)');
    expect(label.className).toContain('text-chill-red');
  });

  it('shows "lebih hemat" in the sage register when behind last month', async () => {
    const hemat = {
      ...advicePayload,
      pace: { ...advicePayload.pace, currentThroughDay: 210000, previousThroughDay: 250000, delta: -40000, percentChange: -16.0 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(hemat)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const label = screen.getByText(/Lebih hemat/);
    expect(label.textContent!.replace(/\s/g, ' ')).toContain('Rp 40.000');
    expect(label.textContent!.replace(/\s/g, ' ')).toContain('(16%)');
    expect(label.className).toContain('text-chill-sage');
  });

  it('reports no baseline when last month has no spend data', async () => {
    const noBaseline = {
      ...advicePayload,
      pace: { currentMonth: '2026-05', day: 31, currentThroughDay: 120000, previousMonth: '2026-04', previousThroughDay: 0, delta: 120000, percentChange: null },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(noBaseline)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Belum ada data bulan lalu untuk dibandingkan.')).toBeInTheDocument();
  });
});

describe('analyseDate (WIB, UTC+7)', () => {
  it('returns today in WIB for the current month', () => {
    // 2026-11-05T18:30Z = 2026-11-06 01:30 WIB
    vi.setSystemTime(new Date('2026-11-05T18:30:00Z'));
    expect(analyseDate('2026-11')).toBe('2026-11-06');
  });

  it('detects the current month in WIB, not the client zone', () => {
    // UTC is still 2026-11-05, WIB already 2026-11-06 -> month is current in WIB.
    vi.setSystemTime(new Date('2026-11-05T18:30:00Z'));
    expect(analyseDate('2026-11')).toBe('2026-11-06');
    // A *prior* month is not current and resolves to its last day.
    expect(analyseDate('2026-10')).toBe('2026-10-31');
  });

  it('resolves non-current months to the last day of that month', () => {
    expect(analyseDate('2026-02')).toBe('2026-02-28'); // non-leap
    expect(analyseDate('2028-02')).toBe('2028-02-29'); // leap
    expect(analyseDate('2026-12')).toBe('2026-12-31');
  });

  it('accepts an injected clock for deterministic tests', () => {
    const d = new Date('2026-11-06T20:00:00Z');
    expect(analyseDate('2026-11', d)).toBe('2026-11-06');
  });
});


describe('AdvicePanel remaining-budget envelope (eval)', () => {
  it('renders the remaining allowance with a per-day figure for the days left', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));

    await waitFor(() => expect(screen.getByText('Sisa anggaran')).toBeInTheDocument());
    // Non-breaking spaces from formatRupiah collapse to a normal space; match loosely.
    expect(screen.getByText((c: string) => c.includes('Terpakai') && c.includes('520.000'))).toBeInTheDocument();
    expect(screen.getByText((c: string) => c.includes('200.000') && c.includes('/hari'))).toBeInTheDocument();
    expect(screen.getByText((c: string) => c.includes('hari terakhir'))).toBeInTheDocument();
  });

  it('warns when the budget is already exceeded (zero remaining allowance)', async () => {
    const over = {
      ...advicePayload,
      remainingAllowance: { anggaran: 520000, spentSoFar: 600000, remainingBudget: 0, daysLeft: 5, perDayAllowance: 0 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(over)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));

    await waitFor(() =>
      expect(screen.getByText((c: string) => c.includes('Anggaran sudah terlampaui'))).toBeInTheDocument(),
    );
  });
});

describe('AdvicePanel daily-menu affordability vs remaining allowance (eval)', () => {
  it('flags a red callout when the menu min cost exceeds the remaining per-day allowance', async () => {
    const tight = {
      ...advicePayload,
      remainingAllowance: { anggaran: 520000, spentSoFar: 480000, remainingBudget: 40000, daysLeft: 2, perDayAllowance: 20000 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tight)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const warn = screen.getByText(/melebihi sisa anggaran/);
    expect(warn.closest('div.rounded-none')).toBeTruthy();
    expect(warn.closest('div[class*="border-chill-red"]')).toBeTruthy();
    expect(warn.textContent!.replace(/\s/g, ' ')).toContain('25.000');
    expect(warn.textContent!.replace(/\s/g, ' ')).toContain('20.000');
    expect(warn.textContent!.replace(/\s/g, ' ')).toContain('2 hari');
  });

  it('shows a sage confirmation when the menu max is within the remaining allowance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const ok = screen.getByText(/masih dalam sisa anggaran/);
    expect(ok.closest('div[class*="border-chill-sage"]')).toBeTruthy();
    expect(screen.queryByText(/melebihi sisa anggaran/)).not.toBeInTheDocument();
  });

  it('renders no affordability callout when no allowance is available (perDayAllowance 0)', async () => {
    const over = {
      ...advicePayload,
      remainingAllowance: { anggaran: 520000, spentSoFar: 600000, remainingBudget: 0, daysLeft: 5, perDayAllowance: 0 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(over)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.queryByText(/melebihi sisa anggaran/)).not.toBeInTheDocument();
    expect(screen.queryByText(/masih dalam sisa anggaran/)).not.toBeInTheDocument();
  });

  it('shows a simple dinner alternative when food spend exceeds the menu plan', async () => {
    const daily = {
      ...advicePayload.daily,
      foodSpend: 45000,
      biayaMax: 30000,
      malamSederhana: 'Telur dadar + sayur bening bayam + nasi kecil (±Rp13k).',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...advicePayload, daily })));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText(/makan malam bisa diganti/)).toBeInTheDocument();
    expect(screen.getByText('Telur dadar + sayur bening bayam + nasi kecil (±Rp13k).')).toBeInTheDocument();
    // The three planned meals still render alongside the fallback tip.
    expect(screen.getByText('Oatmeal + pisang + teh tawar')).toBeInTheDocument();
  });

  it('renders no dinner alternative when food spend stays within the menu plan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.queryByText(/makan malam bisa diganti/)).not.toBeInTheDocument();
  });

  it('renders the monthly nabung target progress', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(advicePayload)));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    // formatRupiah emits a non-breaking space between "Rp" and the amount.
    expect(screen.getByText(/Rp\s*800\.000/)).toBeInTheDocument();
    expect(screen.getByText(/dari target/)).toBeInTheDocument();
    expect(screen.getByText(/25.8%/)).toBeInTheDocument();
    expect(screen.getByText(/dari target.*kurang/)).toBeInTheDocument();
  });

  it('nudges when no savings deposit has been set this month', async () => {
    const m = { target: 3100000, collectedThisMonth: 0, percentCollected: 0, remaining: 3100000, projectedSavings: 0, projectedDeficit: 3100000 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...advicePayload, monthlyNabung: m })));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText('Belum ada setoran Nabung bulan ini.')).toBeInTheDocument();
  });

  it('flags when the projected savings fall short of the monthly target', async () => {
    const m = { target: 3100000, collectedThisMonth: 800000, percentCollected: 25.8, remaining: 2300000, projectedSavings: 400000, projectedDeficit: 2700000 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...advicePayload, monthlyNabung: m })));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const note = screen.getByText(/diperkirakan tersisa/);
    expect(note.textContent).toContain('kurang');
    expect(note.textContent).toContain('2.700.000');
  });

  it('shows when the monthly savings target is projected to be met', async () => {
    const m = { target: 3100000, collectedThisMonth: 1000000, percentCollected: 32.3, remaining: 2100000, projectedSavings: 3100000, projectedDeficit: 0 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...advicePayload, monthlyNabung: m })));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.getByText(/diproyeksikan tercapai/)).toBeInTheDocument();
  });

  it('flags the snack/junk share of food spend when jajan rows are present', async () => {
    const payload = {
      ...advicePayload,
      categoryTrend: [
        { kategori: 'Belanja', total: 300000 },
        { kategori: 'Makan', total: 200000 },
      ],
      jajanTotal: 80000,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload))));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    const note = screen.getByText(/adalah jajan\/snack/);
    expect(note.textContent).toContain('80.000');
    expect(note.textContent).toContain('40%');
  });

  it('does not show the jajan callout when there is no snack spend', async () => {
    const payload = { ...advicePayload, jajanTotal: 0 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload))));
    render(<AdvicePanel apiKey="secret" month="2026-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Analisa & Saran' }));
    await waitFor(() => expect(screen.getByText(/Over budget/)).toBeInTheDocument());

    expect(screen.queryByText(/jajan\/snack/)).not.toBeInTheDocument();
  });
});
