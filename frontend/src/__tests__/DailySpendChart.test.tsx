import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailySpendChart } from '../components/DailySpendChart';
import type { ExpenseItem } from '../expensesApi';

function item(tanggal: string, nominal: number, kategori = 'Makan'): ExpenseItem {
  return { id: 1, tanggal, waktu: '12:00', kategori, keterangan: 'x', nominal };
}

function barsOf(container: HTMLElement) {
  const img = container.querySelector('[aria-label="Pengeluaran per hari"]')!;
  return [...img.querySelectorAll('button[title]')].map((el) => ({
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

describe('DailySpendChart Tagihan (committed bills) exclusion', () => {
  it('excludes Tagihan rows from day totals, matching backend day-total semantics', () => {
    // Backend dayTotal (ExpenseAdviceService) excludes Nabung AND Tagihan; the
    // chart must mirror that. A rent row must not appear as a bar at all.
    const { container } = render(
      <DailySpendChart
        items={[
          item('2026-11-02', 1000000, 'Tagihan'),
          item('2026-11-02', 20000),
        ]}
        month="2026-11"
        anggaran={3900000}
      />,
    );
    const bars = barsOf(container);
    // only the 20k Makan bar remains; the 1M Tagihan rent is excluded
    expect(bars).toHaveLength(1);
    // formatRupiah emits a non-breaking space (U+00A0) — normalize before compare
    const norm = (t: string) => t.replace(/\s/g, ' ');
    expect(norm(bars[0].title)).toContain('Rp 20.000');
    expect(bars[0].className).toContain('bg-chill-accent');
    expect(bars[0].className).not.toContain('bg-chill-red');
  });

  it('shows the empty state when a month has only Tagihan/Nabung rows', () => {
    render(
      <DailySpendChart
        items={[item('2026-11-02', 1000000, 'Tagihan')]}
        month="2026-11"
        anggaran={3900000}
      />,
    );
    expect(screen.getByText('Belum ada pengeluaran harian yang tercatat.')).toBeInTheDocument();
  });

  it('does not flag a day over budget when the only big row is Tagihan', () => {
    // Daily budget for 3.9M/30 = 130k. A 1M rent would falsely flag red if it
    // counted; with Tagihan excluded the day has no discretionary spend at all.
    const { container } = render(
      <DailySpendChart
        items={[
          item('2026-11-02', 1000000, 'Tagihan'),
          item('2026-11-02', 50000),
        ]}
        month="2026-11"
        anggaran={3900000}
      />,
    );
    const bars = barsOf(container);
    expect(bars).toHaveLength(1);
    expect(bars[0].className).toContain('bg-chill-accent');
    expect(bars[0].className).not.toContain('bg-chill-red');
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

describe('DailySpendChart hover affordance', () => {
  it('marks active spend bars as hoverable and adds chill-token hover feedback', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 20000)]} month="2026-11" anggaran={3900000} />,
    );
    const dayCol = container.querySelector('[data-testid="day-2"]') as HTMLElement;
    // the column is the group; cursor-pointer + click live on the bar button
    expect(dayCol.className).toContain('group');
    const bars = barsOf(container);
    expect(bars).toHaveLength(1);
    expect(bars[0].className).toContain('cursor-pointer');
    // accent register hover: sibling of DailyUsageChart's group-hover feedback
    expect(bars[0].className).toContain('group-hover:bg-chill-accent-hover');
    expect(bars[0].className).toContain('group-hover:border-chill-accent');
  });

  it('adds red-register hover feedback to over-budget days', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 250000)]} month="2026-11" anggaran={3000000} />,
    );
    expect(barsOf(container)[0].className).toContain('group-hover:bg-chill-red-hover');
    expect(barsOf(container)[0].className).toContain('group-hover:border-chill-red');
  });

  it('keeps zero-spend stub days non-hoverable', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 20000)]} month="2026-11" anggaran={3900000} />,
    );
    const stub = container.querySelector('[data-testid="day-3"]') as HTMLElement;
    expect(stub.className).not.toContain('group');
    expect(stub.className).not.toContain('cursor-pointer');
  });
});

describe('DailySpendChart drill-down', () => {
  it('calls onSelectDay when a spend bar is clicked', () => {
    let selected: number | null = null;
    const { container } = render(
      <DailySpendChart
        items={[item('2026-11-02', 20000), item('2026-11-06', 15000)]}
        month="2026-11"
        anggaran={3900000}
        onSelectDay={(d) => (selected = d)}
      />,
    );
    const bar2 = container.querySelector('button[aria-label="Lihat transaksi 2 2026-11"]') as HTMLButtonElement;
    expect(bar2).not.toBeNull();
    bar2.click();
    expect(selected).toBe(2);
  });

  it('marks the selected day bar with the accent ring (aria-pressed)', () => {
    const { container } = render(
      <DailySpendChart
        items={[item('2026-11-02', 20000), item('2026-11-06', 15000)]}
        month="2026-11"
        anggaran={3900000}
        selectedDay={6}
      />,
    );
    const bar6 = container.querySelector('button[aria-label="Lihat transaksi 6 2026-11"]') as HTMLButtonElement;
    expect(bar6.getAttribute('aria-pressed')).toBe('true');
    expect(bar6.className).toContain('ring-2');
    const bar2 = container.querySelector('button[aria-label="Lihat transaksi 2 2026-11"]') as HTMLButtonElement;
    expect(bar2.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps zero-spend stub days non-interactive', () => {
    const { container } = render(
      <DailySpendChart items={[item('2026-11-02', 20000)]} month="2026-11" anggaran={3900000} />,
    );
    expect(container.querySelector('button[aria-label="Lihat transaksi 3 2026-11"]')).toBeNull();
  });
});
