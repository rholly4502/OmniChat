import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyUsageChart } from '../components/DailyUsageChart';
import type { ConversationDayUsage } from '../types';

const rows: ConversationDayUsage[] = [
  { date: '2026-10-01', promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  { date: '2026-10-02', promptTokens: 200, completionTokens: 80, totalTokens: 280 },
  { date: '2026-10-05', promptTokens: 40, completionTokens: 20, totalTokens: 60 },
];

describe('DailyUsageChart', () => {
  it('renders the empty state when there are no rows', () => {
    render(<DailyUsageChart rows={[]} />);
    expect(screen.getByText('Belum ada penggunaan harian yang tercatat.')).toBeInTheDocument();
  });

  it('renders the chart image with a column per active day', () => {
    render(<DailyUsageChart rows={rows} />);
    expect(screen.getByLabelText('Penggunaan token per hari')).toBeInTheDocument();
    expect(screen.getByTestId('usage-day-2026-10-01')).toBeInTheDocument();
    expect(screen.getByTestId('usage-day-2026-10-02')).toBeInTheDocument();
    expect(screen.getByTestId('usage-day-2026-10-05')).toBeInTheDocument();
    // Days without activity render as zero-height stubs (gap days are spanned).
    expect(screen.getByTestId('usage-day-2026-10-03')).toBeInTheDocument();
    expect(screen.getByTestId('usage-day-2026-10-04')).toBeInTheDocument();
  });

  it('shows a summary line with active days and total tokens', () => {
    render(<DailyUsageChart rows={rows} />);
    expect(screen.getByText(/3 hari aktif · 490 token/)).toBeInTheDocument();
  });

  it('includes the range label when one is supplied', () => {
    render(<DailyUsageChart rows={rows} rangeLabel="7 hari terakhir" />);
    expect(screen.getByText(/7 hari terakhir ·/)).toBeInTheDocument();
  });

  it('sorts rows oldest-first regardless of input order', () => {
    render(<DailyUsageChart rows={[rows[2]!, rows[0]!, rows[1]!]} />);
    expect(screen.getByTestId('usage-day-2026-10-01')).toBeInTheDocument();
    expect(screen.getByTestId('usage-day-2026-10-05')).toBeInTheDocument();
  });

  it('uses totalTokens as the empty condition, not just row presence', () => {
    const zeroRows = [{ date: '2026-10-01', promptTokens: 0, completionTokens: 0, totalTokens: 0 }];
    render(<DailyUsageChart rows={zeroRows} />);
    expect(screen.getByText('Belum ada penggunaan harian yang tercatat.')).toBeInTheDocument();
  });
});

describe('DailyUsageChart hover affordance', () => {
  it('marks active-day bars as hoverable and adds chill-token hover feedback', () => {
    render(<DailyUsageChart rows={rows} />);
    const col = screen.getByTestId('usage-day-2026-10-01');
    const bar = col.querySelector('div.group.cursor-pointer');
    expect(bar).not.toBeNull();
    const segments = Array.from(bar!.children as HTMLCollectionOf<HTMLElement>);
    const output = segments.find((el) => el.className.includes('bg-chill-accent') && !el.className.includes('/40'));
    const input = segments.find((el) => el.className.includes('bg-chill-accent/40'));
    expect(output!.className).toContain('group-hover:bg-chill-accent-hover');
    expect(output!.className).toContain('group-hover:border-chill-accent');
    expect(output!.className).toContain('transition-colors');
    expect(input!.className).toContain('group-hover:bg-chill-accent/60');
    expect(input!.className).toContain('transition-colors');
  });

  it('keeps zero-activity stub days non-hoverable', () => {
    render(<DailyUsageChart rows={rows} />);
    const stub = screen.getByTestId('usage-day-2026-10-03');
    expect(stub.querySelector('div.group.cursor-pointer')).toBeNull();
  });
});
