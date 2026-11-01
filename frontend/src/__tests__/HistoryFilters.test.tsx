import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HistoryFilters } from '../components/HistoryFilters';

const MODELS = [
  { id: 'hermes-default', label: 'Hermes Default' },
  { id: 'claude-sonnet', label: 'Claude Sonnet' },
];

function setup(over: Partial<Parameters<typeof HistoryFilters>[0]> = {}) {
  const props = {
    models: MODELS,
    modelFilter: '',
    onModelFilterChange: vi.fn(),
    dateFrom: '',
    dateTo: '',
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    ...over,
  };
  return props;
}

describe('HistoryFilters', () => {
  it('renders the model dropdown with a blank option and every catalog model', () => {
    render(<HistoryFilters {...setup()} />);
    const select = screen.getByLabelText('Filter model') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Semua model' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Hermes Default' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Claude Sonnet' })).toBeTruthy();
  });

  it('reports a model selection change', () => {
    const props = setup();
    render(<HistoryFilters {...props} />);
    fireEvent.change(screen.getByLabelText('Filter model'), { target: { value: 'claude-sonnet' } });
    expect(props.onModelFilterChange).toHaveBeenCalledWith('claude-sonnet');
  });

  it('reports start and end date changes', () => {
    const props = setup();
    render(<HistoryFilters {...props} />);
    fireEvent.change(screen.getByLabelText('Filter tanggal mulai'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Filter tanggal akhir'), { target: { value: '2026-11-30' } });
    expect(props.onDateFromChange).toHaveBeenCalledWith('2026-11-01');
    expect(props.onDateToChange).toHaveBeenCalledWith('2026-11-30');
  });

  it('does not show Reset until a filter is set', () => {
    render(<HistoryFilters {...setup()} />);
    expect(screen.queryByLabelText('Hapus semua filter')).toBeNull();
  });

  it('Reset clears every filter at once', () => {
    const props = setup({ modelFilter: 'claude-sonnet', dateFrom: '2026-11-01', dateTo: '2026-11-30' });
    render(<HistoryFilters {...props} />);
    fireEvent.click(screen.getByLabelText('Hapus semua filter'));
    expect(props.onModelFilterChange).toHaveBeenCalledWith('');
    expect(props.onDateFromChange).toHaveBeenCalledWith('');
    expect(props.onDateToChange).toHaveBeenCalledWith('');
  });
});
