import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeeklySpendBreakdown } from '../components/WeeklySpendBreakdown';
import { computeWeeklyBreakdown } from '../weeklyBreakdown';
import type { ExpenseItem } from '../expensesApi';
import { formatRupiah } from '../expensesApi';

function item(tanggal: string, nominal: number, kategori = 'Makan'): ExpenseItem {
  return { id: 0, tanggal, waktu: '12:00', kategori, keterangan: 'x', nominal };
}

// 2026-11-01 is a Sunday; 2026-11-02 is a Monday.
describe('computeWeeklyBreakdown', () => {
  it('groups transactions into Monday-starting weeks', () => {
    const items = [
      item('2026-11-02', 10000),
      item('2026-11-06', 20000),
      item('2026-11-09', 5000),
    ];
    const r = computeWeeklyBreakdown(items, '2026-11');
    expect(r.weeks.find((w) => w.key === '2026-11-02')?.total).toBe(30000);
    expect(r.weeks.find((w) => w.key === '2026-11-09')?.total).toBe(5000);
  });

  it('attributes early-month days to a week starting in the previous month', () => {
    // Nov 1 (Sunday) belongs to the Mon Oct 26 – Sun Nov 1 week.
    const r = computeWeeklyBreakdown([item('2026-11-01', 7000)], '2026-11');
    const wk = r.weeks.find((w) => w.key === '2026-10-26');
    expect(wk?.total).toBe(7000);
    expect(wk?.start.getUTCDate()).toBe(26);
  });

  it('excludes Nabung deposits from week totals', () => {
    const r = computeWeeklyBreakdown(
      [item('2026-11-03', 15000), item('2026-11-04', 5000000, 'Nabung')],
      '2026-11',
    );
    expect(r.weeks.find((w) => w.key === '2026-11-02')?.total).toBe(15000);
  });

  it('covers every calendar week overlapping the month, in order, including empty weeks', () => {
    const r = computeWeeklyBreakdown([item('2026-11-18', 9000)], '2026-11');
    expect(r.weeks.map((w) => w.key)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(r.weeks.find((w) => w.key === '2026-11-16')?.total).toBe(9000);
    expect(r.weeks.find((w) => w.key === '2026-11-23')?.total).toBe(0);
  });

  it('marks the week containing the injected today as current', () => {
    const today = new Date(Date.UTC(2026, 10, 5)); // 2026-11-05 (Thu) → Mon 02
    const r = computeWeeklyBreakdown([item('2026-11-03', 1000)], '2026-11', today);
    expect(r.currentWeekKey).toBe('2026-11-02');
  });
});

describe('<WeeklySpendBreakdown />', () => {
  const today = new Date(Date.UTC(2026, 10, 5)); // current week = 2026-11-02

  it('renders week ranges and totals, highlighting the current week once', () => {
    const items = [
      item('2026-11-02', 12000),
      item('2026-11-06', 8000),
      item('2026-11-17', 25000),
    ];
    render(<WeeklySpendBreakdown items={items} month="2026-11" today={today} />);

    expect(screen.getByText('2 Nov – 8 Nov')).toBeInTheDocument();
    expect(screen.getByText('16 Nov – 22 Nov')).toBeInTheDocument();
    // formatRupiah emits a non-breaking space (U+00A0) between "Rp" and the amount,
    // and getByText compares the raw query to the *normalized* node text. Match the
    // amount span itself (tabular-nums — unique per value) with a whitespace-collapsing
    // comparison so ancestors/wrappers that duplicate the text don't cause a multiple hit.
    const rp = (n: number) => formatRupiah(n).replace(/\s+/g, ' ');
    const findAmount = (n: number) =>
      screen.getByText((content, el) => {
        const node = el as HTMLElement | null;
        return !!node && node.classList.contains('tabular-nums') && content.replace(/\s+/g, ' ') === rp(n);
      });
    expect(findAmount(20000)).toBeInTheDocument();
    expect(findAmount(25000)).toBeInTheDocument();

    const chips = screen.getAllByText('Minggu ini');
    expect(chips).toHaveLength(1);
    expect(chips[0].closest('li')).toHaveAttribute('data-testid', 'week-2026-11-02');
  });

  it('shows the empty state when no non-Nabung spend exists', () => {
    render(<WeeklySpendBreakdown items={[item('2026-11-03', 5000000, 'Nabung')]} month="2026-11" today={today} />);
    expect(screen.getByText('Belum ada pengeluaran mingguan yang tercatat.')).toBeInTheDocument();
  });
});
