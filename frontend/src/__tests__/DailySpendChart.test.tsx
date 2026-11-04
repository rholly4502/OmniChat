import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailySpendChart } from '../components/DailySpendChart';
import type { ExpenseItem } from '../expensesApi';

function item(tanggal: string, nominal: number, kategori = 'Makan'): ExpenseItem {
  return { id: 1, tanggal, waktu: '12:00', kategori, keterangan: 'x', nominal };
}

function barsOf(container: HTMLElement) {
  const img = container.querySelector('[aria-label="Pengeluaran per hari"]')!;
  return [...img.querySelectorAll('div[title]')].map((el) => ({
    title: el.getAttribute('title')!,
    className: typeof el.className === 'string' ? el.className : String(el.getAttribute('class')),
  }));
}

describe('DailySpendChart', () => {
  it('shows an empty message when the month has no spend (savings deposits excluded)', () => {
    const { container } = render(
      <DailySpendChart
        items={[item('2026-11-05', 500000, 'Nabung')]}
        month="2026-11"
        anggaran={3900000}
      />,
    );
    expect(screen.getByText('Belum ada pengeluaran harian yang tercatat.')).toBeInTheDocument();
    // pixel2 empty-state register: the barren line carries a decorative ornament.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('aggregates spend per day and excludes savings deposits', () => {
    const { container } = render(
      <DailySpendChart
        items={[
          item('2026-11-02', 20000),
          item('2026-11-02', 30000),
          item('2026-11-03', 15000),
          item('2026-11-03', 1000000, 'Nabung'),
        ]}
        month="2026-11"
        anggaran={3900000}
      />,
    );
    expect(screen.getByLabelText('Pengeluaran per hari')).toBeInTheDocument();
    const bars = barsOf(container);
    // day 02 = 20k + 30k = 50k; day 03 = 15k (the 1M Nabung is excluded)
    const norm = (t: string) => t.replace(/\s/g, ' ');
    expect(bars.some((b) => norm(b.title).includes('2 2026-11: Rp 50.000'))).toBe(true);
    expect(bars.some((b) => norm(b.title).includes('3 2026-11: Rp 15.000'))).toBe(true);
    expect(bars).toHaveLength(2);
  });

  it('renders one column per day of the month', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-02-14', 20000)]} month="2026-02" anggaran={null} />,
    );
    const img = container.querySelector('[aria-label="Pengeluaran per hari"]')!;
    expect(img.querySelectorAll('[data-testid^="day-"]')).toHaveLength(28);
    expect(barsOf(container)).toHaveLength(1);
  });

  it('flags a day over the daily budget in the red register', () => {
    // November has 30 days; anggaran 3.000.000 -> daily budget 100.000.
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 250000)]} month="2026-11" anggaran={3000000} />,
    );
    const bars = barsOf(container);
    expect(bars).toHaveLength(1);
    expect(bars[0].className).toContain('bg-chill-red/70');
  });

  it('does not flag a day within the daily budget', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 80000)]} month="2026-11" anggaran={3000000} />,
    );
    expect(barsOf(container)[0].className).toContain('bg-chill-accent');
    expect(barsOf(container)[0].className).not.toContain('bg-chill-red');
  });

  it('renders a dashed budget reference line only when a budget is set', () => {
    const { container, rerender } = render(
      <DailySpendChart items={[item('2026-11-02', 10000)]} month="2026-11" anggaran={3900000} />,
    );
    expect(screen.getByText(/Garis putus-putus/)).toBeInTheDocument();
    // pixel2 register: the reference line must be a stepped square dash
    // (`.pixel-dash-line` token) — never the smooth anti-aliased browser
    // `border-dashed`, so it snaps in hard beats.
    const line = container.querySelector('.pixel-dash-line')!;
    expect(line).not.toBeNull();
    expect(line.className).not.toContain('border-dashed');

    rerender(<DailySpendChart items={[item('2026-11-02', 10000)]} month="2026-11" anggaran={null} />);
    expect(screen.queryByText(/Garis putus-putus/)).not.toBeInTheDocument();
  });
});

describe('DailySpendChart partial-month target (Hari)', () => {
  it('prorates the daily-budget reference to the active-day count', () => {
    // October is a partial month: anggaran 520.000 over 4 declared days -> daily
    // budget 130.000. A 50k spend is under that, so it must NOT be flagged red
    // (under the old full-calendar 520k/31≈16.774 logic it would have been).
    const { container } = render(
      <DailySpendChart
        items={[item('2026-10-28', 50000)]}
        month="2026-10"
        anggaran={520000}
        hari={4}
      />,
    );
    const bars = barsOf(container);
    expect(bars).toHaveLength(1);
    expect(bars[0].className).toContain('bg-chill-accent');
    expect(bars[0].className).not.toContain('bg-chill-red');
  });

  it('flags a spend over the prorated daily budget in the red register', () => {
    const { container } = render(
      <DailySpendChart
        items={[item('2026-10-28', 150000)]}
        month="2026-10"
        anggaran={520000}
        hari={4}
      />,
    );
    expect(barsOf(container)[0].className).toContain('bg-chill-red/70');
  });
});

describe('DailySpendChart day-axis', () => {
  it('renders sparse day tick labels aligned to the column grid', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 20000)]} month="2026-11" anggaran={3900000} />,
    );
    const labels = [...container.querySelectorAll('[data-testid="day-axis"] span')]
      .map((s) => s.textContent)
      .filter(Boolean);
    // November has 30 days -> ticks every 5 (plus day 1): 1,5,10,15,20,25,30
    expect(labels).toEqual(['1', '5', '10', '15', '20', '25', '30']);
  });

  it('omits non-tick days and never drops the last day', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-02-14', 20000)]} month="2026-02" anggaran={null} />,
    );
    // February 2026 has 28 days -> 1,5,10,15,20,25,28
    const labels = [...container.querySelectorAll('[data-testid="day-axis"] span')]
      .map((s) => s.textContent)
      .filter(Boolean);
    expect(labels).toEqual(['1', '5', '10', '15', '20', '25', '28']);
  });
});
