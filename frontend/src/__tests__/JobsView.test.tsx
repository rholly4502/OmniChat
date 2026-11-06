import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobsView } from '../components/JobsView';
import type { Opportunity } from '../jobsApi';

// Control useJobs from the test instead of exercising the real fetch path —
// JobsView only renders the hook result, so a mocked hook keeps every state
// branch (loading / error / empty / grouped list) deterministic.
const useJobsMock = vi.hoisted(() => ({
  useJobs: vi.fn(),
}));

vi.mock('../hooks/useJobs', () => ({
  useJobs: useJobsMock.useJobs,
}));

const base: Opportunity = {
  id: 1,
  judul: 'Backend .NET Developer',
  perusahaan: 'PT Contoh',
  lokasi: 'Jakarta',
  tipe: 'Kontrak',
  gaji: 'IDR 15-25 jt',
  link: 'https://example.com/job',
  catatan: null,
  status: 'new',
  ditemukan: '2026-11-06',
  sourceId: null,
};

const fte: Opportunity = { ...base, id: 2, judul: 'Senior .NET Engineer', tipe: 'FTE', status: 'interview' };
const freelance: Opportunity = { ...base, id: 3, judul: 'Freelance Blazor', tipe: 'Part-time / Freelance', status: 'offer' };

interface MockJobsState {
  opportunities: Opportunity[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  reload: () => void;
}

function mockState(overrides: Partial<MockJobsState> = {}) {
  const defaults = {
    opportunities: [fte, base, freelance],
    loading: false,
    error: null as string | null,
    statusFilter: '',
    setStatusFilter: vi.fn(),
    reload: vi.fn(),
  };
  useJobsMock.useJobs.mockReturnValue({ ...defaults, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JobsView', () => {
  it('groups opportunities by type with labeled headers and counts', () => {
    mockState();
    render(<JobsView />);

    // All three groups render with their count in the label.
    expect(screen.getByText('FTE — pengganti utama (1)')).toBeTruthy();
    expect(screen.getByText('Kontrak — pengganti utama (1)')).toBeTruthy();
    expect(screen.getByText('Part-time / Freelance — bisa double job (1)')).toBeTruthy();

    expect(screen.getByText('Senior .NET Engineer')).toBeTruthy();
    expect(screen.getByText('Backend .NET Developer')).toBeTruthy();
    expect(screen.getByText('Freelance Blazor')).toBeTruthy();
    expect(screen.getByText('Interview')).toBeTruthy();
    expect(screen.getByText('Tawaran')).toBeTruthy();
    expect(screen.getAllByText('Lihat lowongan →')).toHaveLength(3);
    expect(screen.getAllByText('PT Contoh · Jakarta')).toHaveLength(3);
  });

  it('shows a loading status until the list is ready', () => {
    mockState({ loading: true, opportunities: [] });
    render(<JobsView />);
    expect(screen.getByText('Mencari lowongan…')).toBeTruthy();
  });

  it('renders the empty state when there are no opportunities', () => {
    mockState({ opportunities: [] });
    render(<JobsView />);
    expect(screen.getByText('Belum ada lowongan.')).toBeTruthy();
  });

  it('renders the empty state with the active status filter when one is set', () => {
    mockState({ opportunities: [], statusFilter: 'offer' });
    render(<JobsView />);
    expect(screen.getByText('Belum ada lowongan berstatus Tawaran.')).toBeTruthy();
  });

  it('calls setStatusFilter when a filter tab is clicked', () => {
    const setStatusFilter = vi.fn();
    mockState({ setStatusFilter });
    render(<JobsView />);

    fireEvent.click(screen.getByRole('tab', { name: 'Interview (1)' }));
    expect(setStatusFilter).toHaveBeenCalledWith('interview');
  });

  it('toggles a filter off when the active tab is clicked again', () => {
    const setStatusFilter = vi.fn();
    mockState({ setStatusFilter, statusFilter: 'interview' });
    render(<JobsView />);

    fireEvent.click(screen.getByRole('tab', { name: 'Interview (1)' }));
    expect(setStatusFilter).toHaveBeenCalledWith('');
  });

  it('shows a friend error with a working Coba lagi button', () => {
    const reload = vi.fn();
    mockState({ error: 'Gagal memuat lowongan (401).', opportunities: [], reload });
    render(<JobsView />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Gagal memuat lowongan (401).');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
