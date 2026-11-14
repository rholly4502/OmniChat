import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventsView } from '../components/EventsView';
import { createEvent, deleteEvent, exportEventsCsv, updateEvent, type PromoEvent } from '../eventsApi';

vi.mock('../eventsApi', async () => ({
  ...(await vi.importActual<typeof import('../eventsApi')>('../eventsApi')),
  exportEventsCsv: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

// Control useEvents from the test instead of exercising the real fetch path —
// EventsView only renders the hook result, so a mocked hook keeps every state
// branch (loading / error / empty / grouped list) deterministic.
const useEventsMock = vi.hoisted(() => ({
  useEvents: vi.fn(),
}));

vi.mock('../hooks/useEvents', () => ({
  useEvents: useEventsMock.useEvents,
}));

const base: PromoEvent = {
  id: 1,
  aplikasi: 'Gojek',
  judul: 'Cashback 50% GoFood',
  syarat: 'Min. transaksi Rp50.000',
  link: 'https://example.com/promo',
  berlakuSampai: '2026-12-31',
  ditemukan: '2026-11-06',
};

const grab: PromoEvent = { ...base, id: 2, aplikasi: 'Grab', judul: 'Voucher GrabCar 20%' };

interface MockEventsState {
  events: PromoEvent[];
  loading: boolean;
  error: string | null;
  appFilter: string;
  setAppFilter: (a: string) => void;
  reload: () => void;
}

function mockState(overrides: Partial<MockEventsState> = {}) {
  const defaults: MockEventsState = {
    events: [base, grab],
    loading: false,
    error: null,
    appFilter: '',
    setAppFilter: vi.fn(),
    reload: vi.fn(),
  };
  useEventsMock.useEvents.mockReturnValue({ ...defaults, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventsView', () => {
  it('renders grouped events with platform headings and counts', () => {
    mockState();
    render(<EventsView />);
    expect(screen.getByRole('heading', { name: /Gojek \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Grab \(1\)/ })).toBeTruthy();
  });

  it('filter tabs carry the pixel press-slide feedback (active + active)', () => {
    mockState();
    render(<EventsView />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      const cls = tab.getAttribute('class') ?? '';
      expect(cls).toContain('active:translate-y-[2px]');
      expect(cls).toContain('rounded-none');
    }
  });

  it('"Lihat promo" external link carries press feedback and a 44px target', () => {
    mockState();
    render(<EventsView />);
    const links = screen.getAllByRole('link', { name: /Lihat promo/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const cls = link.getAttribute('class') ?? '';
      expect(cls).toContain('active:bg-chill-accent/30');
      expect(cls).toContain('active:translate-y-[2px]');
      expect(cls).toContain('min-h-[44px]');
    }
  });

  it('event card has a hard-edged hover surface', () => {
    mockState();
    render(<EventsView />);
    const cards = document.querySelectorAll('li');
    expect(cards.length).toBe(2);
    for (const card of cards) {
      const cls = card.getAttribute('class') ?? '';
      expect(cls).toContain('hover:bg-chill-elevated');
      expect(cls).toContain('rounded-none');
    }
  });

  it('loading state uses the shared ScanLoader stepped loader (parity with Jobs/Expenses)', () => {
    mockState({ loading: true });
    render(<EventsView />);
    // Full-page loader pattern: role=status live region carrying the human label,
    // plus the pixel-scan ScanLoader (not the older single blink square).
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Memuat event');
    expect(status.querySelector('.pixel-scan')).toBeTruthy();
    expect(status.querySelector('.pixel-blink')).toBeNull();
  });
});

describe('EventsView filter tablist keyboard navigation', () => {
  const pills = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll('div[aria-label="Filter aplikasi"] button[role="tab"]'),
    );

  it('keeps only the selected tab in the tab order (roving tabindex)', () => {
    mockState();
    const { container } = render(<EventsView />);
    const tabs = pills(container);
    expect(tabs.length).toBe(3); // Semua + Gojek + Grab (both count 1, alpha order)
    expect(tabs[0].getAttribute('tabindex')).toBe('0'); // Semua selected by default
    for (let i = 1; i < tabs.length; i++) {
      expect(tabs[i].getAttribute('tabindex')).toBe('-1');
    }
  });

  it('ArrowRight selects and focuses the next app-filter pill', () => {
    const setAppFilter = vi.fn();
    mockState({ setAppFilter });
    const { container } = render(<EventsView />);
    const list = container.querySelector('div[aria-label="Filter aplikasi"]')!;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(setAppFilter).toHaveBeenCalledWith('Gojek'); // first app (alpha)
    const tabs = pills(container);
    expect(document.activeElement).toBe(tabs[1]);
  });

  it('ArrowLeft wraps from the first pill (Semua) to the last', () => {
    const setAppFilter = vi.fn();
    mockState({ setAppFilter });
    const { container } = render(<EventsView />);
    const list = container.querySelector('div[aria-label="Filter aplikasi"]')!;
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(setAppFilter).toHaveBeenCalledWith('Grab'); // last app (alpha)
    const tabs = pills(container);
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it('Home/End jump to the first/last pill', () => {
    const setAppFilter = vi.fn();
    mockState({ appFilter: 'Grab', setAppFilter });
    const { container } = render(<EventsView />);
    const list = container.querySelector('div[aria-label="Filter aplikasi"]')!;
    fireEvent.keyDown(list, { key: 'Home' });
    expect(setAppFilter).toHaveBeenLastCalledWith('');
    fireEvent.keyDown(list, { key: 'End' });
    expect(setAppFilter).toHaveBeenLastCalledWith('Grab');
    const tabs = pills(container);
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it('ArrowRight on the last pill wraps to Semua and moves focus', () => {
    const setAppFilter = vi.fn();
    mockState({ appFilter: 'Grab', setAppFilter });
    const { container } = render(<EventsView />);
    const list = container.querySelector('div[aria-label="Filter aplikasi"]')!;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(setAppFilter).toHaveBeenCalledWith('');
    const tabs = pills(container);
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('non-navigation keys do not call the setter (Tab still works)', () => {
    const setAppFilter = vi.fn();
    mockState({ setAppFilter });
    const { container } = render(<EventsView />);
    const list = container.querySelector('div[aria-label="Filter aplikasi"]')!;
    fireEvent.keyDown(list, { key: 'Tab' });
    expect(setAppFilter).not.toHaveBeenCalled();
  });
});

describe('EventsView CSV export', () => {
  it('downloads the event list as CSV through exportEventsCsv (respects active app filter)', async () => {
    mockState({ appFilter: 'Gojek' });
    const exportMock = vi.mocked(exportEventsCsv);
    exportMock.mockResolvedValue(new Blob(['aplikasi,judul'], { type: 'text/csv; charset=utf-8' }));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({ apiKey: 'k' }, 'Gojek'));
    expect(click).toHaveBeenCalledTimes(1);

    createUrl.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('shows an error message when the export fails', async () => {
    mockState();
    const exportMock = vi.mocked(exportEventsCsv);
    exportMock.mockRejectedValue(new Error('fail'));

    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Gagal mengekspor CSV.'));
  });

  it('disables the export button while loading', () => {
    mockState({ loading: true });
    render(<EventsView />);
    expect(screen.getByRole('button', { name: 'Ekspor CSV' })).toBeDisabled();
  });
});

describe('EventsView manual curation', () => {
  const createMock = vi.mocked(createEvent);
  const updateMock = vi.mocked(updateEvent);
  const deleteMock = vi.mocked(deleteEvent);

  const fillRequired = (aplikasi = 'GoPay', judul = 'Cashback 20%') => {
    fireEvent.change(screen.getByLabelText('Aplikasi'), { target: { value: aplikasi } });
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: judul } });
  };

  it('Tambah opens the inline form with today as the default ditemukan', () => {
    mockState();
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah event' }));
    expect(screen.getByRole('heading', { name: 'Tambah Event' })).toBeTruthy();
    expect((screen.getByLabelText('Tanggal ditemukan') as HTMLInputElement).value).toBeTruthy();
  });

  it('saving a new event calls createEvent then reloads and closes', async () => {
    createMock.mockResolvedValue({ ...base, id: 99 });
    const reload = vi.fn();
    mockState({ reload });
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah event' }));
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ aplikasi: 'GoPay', judul: 'Cashback 20%' }),
        { apiKey: 'k' },
      ),
    );
    expect(reload).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Tambah Event' })).toBeNull());
  });

  it('blocks save when required fields are empty (no API call)', async () => {
    mockState();
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah event' }));
    fireEvent.change(screen.getByLabelText('Aplikasi'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(screen.getByRole('alert').textContent).toContain('Aplikasi wajib diisi.');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('requires an API key before saving', () => {
    mockState();
    render(<EventsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah event' }));
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('API key'))).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Edit pre-fills the form and saving calls updateEvent with the right id', async () => {
    updateMock.mockResolvedValue({ ...base, judul: 'Judul Baru' });
    const reload = vi.fn();
    mockState({ reload });
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.getByRole('heading', { name: 'Edit Event' })).toBeTruthy();
    expect((screen.getByLabelText('Aplikasi') as HTMLInputElement).value).toBe('Gojek');
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Judul Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(1, expect.objectContaining({ judul: 'Judul Baru' }), { apiKey: 'k' }),
    );
    expect(reload).toHaveBeenCalled();
  });

  it('Hapus confirms then calls deleteEvent and reloads', async () => {
    deleteMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reload = vi.fn();
    mockState({ reload });
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hapus' })[0]);
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(1, { apiKey: 'k' }));
    expect(reload).toHaveBeenCalled();
  });

  it('Hapus without confirm does not delete', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockState();
    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hapus' })[0]);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
