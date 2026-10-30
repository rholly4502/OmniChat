import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExpenseTrendChart } from '../components/ExpenseTrendChart';
import { shortMonth } from '../expenseTrendFormat';
import type { ExpenseTrendPoint } from '../expensesApi';

describe('shortMonth', () => {
  it('maps a YYYY-MM key to an Indonesian short month', () => {
    expect(shortMonth('2026-10')).toBe('Okt');
    expect(shortMonth('2026-12')).toBe('Des');
    expect(shortMonth('2026-01')).toBe('Jan');
  });
});

describe('ExpenseTrendChart', () => {
  it('shows an empty message when there are no points', () => {
    render(<ExpenseTrendChart points={[]} />);
    expect(screen.getByText('Belum ada data tren.')).toBeInTheDocument();
  });

  it('renders a bar per point with month labels', () => {
    const points: ExpenseTrendPoint[] = [
      { month: '2026-05', total: 100000 },
      { month: '2026-06', total: 0 },
    ];
    const { container } = render(<ExpenseTrendChart points={points} />);
    expect(screen.getByLabelText('Tren pengeluaran bulanan')).toBeInTheDocument();
    // two bars (one real, one zero placeholder)
    expect(container.querySelectorAll('div[title]')).toHaveLength(1);
    expect(container.querySelector('div[title]')!.getAttribute('title')).toContain('100.000');
  });
});
