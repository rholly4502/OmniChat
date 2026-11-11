import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobsView } from '../components/JobsView';
import { OPPORTUNITY_STATUSES, type Opportunity } from '../jobsApi';

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
    cvFiles: [] as string[],
    cvError: null as string | null,
    downloadCv: vi.fn(),
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
    expect(screen.getAllByText('Interview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tawaran').length).toBeGreaterThan(0);
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

describe('JobsView tiering (prioritas rekomendasi)', () => {
  it('menandai part-time / Malaysia-Singapura yang masih baru sebagai Prioritas, lainnya Standar', () => {
    const ptNew: Opportunity = { ...base, id: 10, judul: 'Part-time Blazor', tipe: 'Part-time / Freelance' };
    const myNew: Opportunity = { ...base, id: 11, judul: '.NET KL', lokasi: 'Kuala Lumpur, Malaysia' };
    const kontrakNew: Opportunity = { ...base, id: 12, judul: 'Kontrak Jakarta' };
    mockState({ opportunities: [ptNew, myNew, kontrakNew] });
    render(<JobsView />);
    expect(screen.getAllByText('Prioritas').length).toBe(2);
    expect(screen.getByText('Standar')).toBeTruthy();
  });

  it('menyaring hanya Prioritas saat tab Prioritas diklik', () => {
    const ptNew: Opportunity = { ...base, id: 10, judul: 'Part-time Blazor', tipe: 'Part-time / Freelance' };
    const kontrakNew: Opportunity = { ...base, id: 12, judul: 'Kontrak Jakarta' };
    mockState({ opportunities: [ptNew, kontrakNew] });
    render(<JobsView />);
    fireEvent.click(screen.getByRole('tab', { name: 'Prioritas (1)' }));
    expect(screen.getByText('Part-time Blazor')).toBeTruthy();
    expect(screen.queryByText('Kontrak Jakarta')).toBeNull();
  });
});

describe('JobsView job card micro-interaction', () => {
  it('every opportunity card carries the shared hover register (transition + hover:bg-chill-elevated)', () => {
    mockState();
    const { container } = render(<JobsView />);
    // Cards are the <li> elements inside the grouped list (the empty-state box is a div).
    const cards = container.querySelectorAll('ul li');
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.className).toContain('transition');
      expect(card.className).toContain('hover:bg-chill-elevated');
    });
  });

  it('follow-up save button carries the shared accent press register (hover + active bg)', () => {
    mockState();
    render(<JobsView />);
    const atur = screen.getAllByRole('button', { name: /Atur follow-up/ })[0];
    fireEvent.click(atur);
    const simpan = screen.getByRole('button', { name: 'Simpan' });
    expect(simpan.className).toContain('transition');
    expect(simpan.className).toContain('hover:bg-chill-accent/20');
    expect(simpan.className).toContain('active:bg-chill-accent/30');
    expect(simpan.className).toContain('active:translate-y-[2px]');
  });
});
describe('JobsView filter controls (pixel icon + micro-interaction)', () => {
  it('uses crisp SVG icons and rotates the chevron with a stepped transition on toggle', () => {
    mockState();
    const { container } = render(<JobsView />);

    const chevronSvg = () =>
      Array.from(container.querySelectorAll('svg[aria-hidden="true"]')).find(
        (s) => s.querySelector('polyline'),
      );
    // SVG className is an SVGAnimatedString; read the real class list via getAttribute.
    const chevronClass = () => chevronSvg()!.getAttribute('class') ?? '';

    // Default open: the chevron is rotated via a stepped transform transition.
    expect(chevronSvg()).toBeTruthy();
    expect(chevronClass()).toContain('rotate-180');
    expect(chevronClass()).toContain('transition-transform');
    expect(chevronClass()).toContain('[transition-timing-function:steps(3,jump-none)]');

    // No text-glyph placeholder icons remain on the toggle.
    expect(screen.queryByText('≡')).toBeNull();
    expect(screen.queryByText('▲')).toBeNull();
    expect(screen.queryByText('▼')).toBeNull();

    const toggle = screen.getByRole('button', { name: /Filter/ });
    fireEvent.click(toggle); // collapse
    expect(chevronClass()).not.toContain('rotate-180');

    fireEvent.click(toggle); // expand again
    expect(chevronClass()).toContain('rotate-180');
  });
});

describe('JobsView filter tablist keyboard navigation', () => {
  const pills = (container: HTMLElement, label: string) =>
    Array.from(
      container.querySelectorAll(`div[aria-label="${label}"] button[role="tab"]`),
    );

  it('keeps only the selected tab in the tab order per group (roving tabindex)', () => {
    mockState();
    const { container } = render(<JobsView />);
    const type = pills(container, 'Filter posisi');
    expect(type.length).toBe(4); // Semua + FTE + Kontrak + Part-time
    expect(type[0].getAttribute('tabindex')).toBe('0');
    for (let i = 1; i < type.length; i++) expect(type[i].getAttribute('tabindex')).toBe('-1');

    const status = pills(container, 'Filter status');
    expect(status[0].getAttribute('tabindex')).toBe('0'); // Semua
    for (let i = 1; i < status.length; i++) expect(status[i].getAttribute('tabindex')).toBe('-1');

    const tier = pills(container, 'Filter prioritas');
    expect(tier[0].getAttribute('tabindex')).toBe('0');
  });

  it('ArrowRight selects and focuses the next type-filter pill', () => {
    mockState();
    const { container } = render(<JobsView />);
    const list = container.querySelector('div[aria-label="Filter posisi"]')!;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    const type = pills(container, 'Filter posisi');
    expect(type[1].getAttribute('aria-selected')).toBe('true');
    expect(type[1].getAttribute('tabindex')).toBe('0');
    expect(type[0].getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(type[1]);
  });

  it('ArrowLeft wraps from the first pill to the last', () => {
    mockState();
    const { container } = render(<JobsView />);
    const list = container.querySelector('div[aria-label="Filter posisi"]')!;
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    const type = pills(container, 'Filter posisi');
    expect(type[type.length - 1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(type[type.length - 1]);
  });

  it('Home/End jump to the first/last tier pill', () => {
    mockState();
    const { container } = render(<JobsView />);
    const list = container.querySelector('div[aria-label="Filter prioritas"]')!;
    fireEvent.keyDown(list, { key: 'End' });
    const tier = pills(container, 'Filter prioritas');
    expect(tier[tier.length - 1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(pills(container, 'Filter prioritas')[0].getAttribute('aria-selected')).toBe('true');
  });

  it('status group arrows call the status setter for the next status and move focus', () => {
    const setStatusFilter = vi.fn();
    mockState({ setStatusFilter });
    const { container } = render(<JobsView />);
    const list = container.querySelector('div[aria-label="Filter status"]')!;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(setStatusFilter).toHaveBeenCalledWith(OPPORTUNITY_STATUSES[0]);
    const status = pills(container, 'Filter status');
    expect(document.activeElement).toBe(status[1]);
  });
});
