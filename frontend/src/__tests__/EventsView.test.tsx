import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventsView } from '../components/EventsView';
import { countdownLabel, eventStatus, sortEventsByUrgency } from '../eventsStatus';
import { createEvent, deleteEvent, exportEventsCsv, exportEventsPdf, updateEvent, type PromoEvent } from '../eventsApi';

vi.mock('../eventsApi', async () => ({
  ...(await vi.importActual<typeof import('../eventsApi')>('../eventsApi')),
  exportEventsCsv: vi.fn(),
  exportEventsPdf: vi.fn(),
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
  updatingId: number | null;
  updateDipakai: (id: number, dipakai: boolean) => Promise<void>;
}

function mockState(overrides: Partial<MockEventsState> = {}) {
  const defaults: MockEventsState = {
    events: [base, grab],
    loading: false,
    error: null,
    appFilter: '',
    setAppFilter: vi.fn(),
    reload: vi.fn(),
    updatingId: null,
    updateDipakai: vi.fn().mockResolvedValue(undefined),
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

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({ apiKey: 'k' }, 'Gojek', undefined, undefined));
    expect(click).toHaveBeenCalledTimes(1);

    createUrl.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('forwards the active keyword and hide-expired filters to the export', async () => {
    mockState();
    const exportMock = vi.mocked(exportEventsCsv);
    exportMock.mockResolvedValue(new Blob(['aplikasi,judul'], { type: 'text/csv; charset=utf-8' }));

    render(<EventsView apiKey="k" />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari event' }), { target: { value: 'cashback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan kedaluwarsa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({ apiKey: 'k' }, undefined, 'cashback', true));
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

describe('EventsView PDF export', () => {
  it('downloads the event list as PDF through exportEventsPdf (respects active app filter)', async () => {
    mockState({ appFilter: 'Gojek' });
    const exportMock = vi.mocked(exportEventsPdf);
    exportMock.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor PDF' }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({ apiKey: 'k' }, 'Gojek', undefined, undefined));
    expect(click).toHaveBeenCalledTimes(1);

    createUrl.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('forwards the active keyword and hide-expired filters to the PDF export', async () => {
    mockState();
    const exportMock = vi.mocked(exportEventsPdf);
    exportMock.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));

    render(<EventsView apiKey="k" />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari event' }), { target: { value: 'cashback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan kedaluwarsa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor PDF' }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({ apiKey: 'k' }, undefined, 'cashback', true));
  });

  it('shows an error message when the PDF export fails', async () => {
    mockState();
    const exportMock = vi.mocked(exportEventsPdf);
    exportMock.mockRejectedValue(new Error('fail'));

    render(<EventsView apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor PDF' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Gagal mengekspor PDF.'));
  });

  it('disables the PDF export button while loading', () => {
    mockState({ loading: true });
    render(<EventsView />);
    expect(screen.getByRole('button', { name: 'Ekspor PDF' })).toBeDisabled();
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


describe('EventsView keyword search', () => {
  const input = () => screen.getByLabelText('Cari event') as HTMLInputElement;

  it('filters events by title keyword (case-insensitive)', () => {
    mockState();
    render(<EventsView />);
    fireEvent.change(input(), { target: { value: 'gofood' } });
    expect(screen.getByRole('heading', { name: /Gojek \(1\)/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Grab \(1\)/ })).toBeNull();
  });

  it('matches benefit/syarat text', () => {
    const withSyarat: PromoEvent = { ...base, id: 3, aplikasi: 'DANA', judul: 'Bonus saldo DANA 20%', syarat: 'Min. top-up Rp50.000' };
    mockState({ events: [withSyarat, grab] });
    render(<EventsView />);
    fireEvent.change(input(), { target: { value: 'top-up' } });
    expect(screen.getByRole('heading', { name: /DANA \(1\)/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Grab \(1\)/ })).toBeNull();
  });

  it('clearing the query restores the full list', () => {
    mockState();
    render(<EventsView />);
    fireEvent.change(input(), { target: { value: 'voucher' } });
    expect(screen.getByRole('heading', { name: /Grab \(1\)/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Gojek \(1\)/ })).toBeNull();
    fireEvent.change(input(), { target: { value: '' } });
    expect(screen.getByRole('heading', { name: /Gojek \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Grab \(1\)/ })).toBeTruthy();
  });

  it('combines with the platform filter', () => {
    mockState({ appFilter: 'Gojek' });
    render(<EventsView />);
    fireEvent.change(input(), { target: { value: 'voucher' } });
    expect(screen.getByText(/Belum ada event/)).toBeTruthy();
    fireEvent.change(input(), { target: { value: 'cashback' } });
    expect(screen.getByRole('heading', { name: /Gojek \(1\)/ })).toBeTruthy();
  });

  it('empty results show the query in the empty-state message', () => {
    mockState();
    render(<EventsView />);
    fireEvent.change(input(), { target: { value: 'zzzz' } });
    expect(screen.getByText(/cocok “zzzz”/)).toBeTruthy();
  });
});
describe('EventsView dipakai (sudah dipakai)', () => {
  it('toggle button marks an event as used via updateDipakai', async () => {
    const updateDipakai = vi.fn().mockResolvedValue(undefined);
    mockState({ updatingId: null, updateDipakai });
    render(<EventsView />);
    const toggle = screen.getAllByRole('button', { name: 'Tandai sudah dipakai' })[0];
    fireEvent.click(toggle);
    expect(updateDipakai).toHaveBeenCalledWith(1, true);
  });

  it('renders "Batal pakai" and unmarks a used event', async () => {
    const used = { ...base, id: 1, dipakai: true };
    const updateDipakai = vi.fn().mockResolvedValue(undefined);
    mockState({ events: [used, grab], updatingId: null, updateDipakai });
    render(<EventsView />);
    const toggle = screen.getAllByRole('button', { name: 'Batal pakai' })[0];
    fireEvent.click(toggle);
    expect(updateDipakai).toHaveBeenCalledWith(1, false);
  });

  it('"Sembunyikan yang sudah dipakai" hides redeemed events only', () => {
    const used = { ...grab, id: 2, dipakai: true };
    mockState({ events: [base, used], updatingId: null, updateDipakai: vi.fn() });
    render(<EventsView />);
    expect(screen.getByText('Voucher GrabCar 20%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan yang sudah dipakai' }));
    expect(screen.queryByText('Voucher GrabCar 20%')).toBeNull();
    expect(screen.getByText('Cashback 50% GoFood')).toBeTruthy();
  });

  it('disables the toggle while that event is being updated', () => {
    mockState({ updatingId: 1, updateDipakai: vi.fn() });
    render(<EventsView />);
    const buttons = screen.getAllByRole('button', { name: 'Tandai sudah dipakai' });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });
});

describe('eventStatus', () => {
  it('marks a past end date as expired', () => {
    expect(eventStatus('2026-10-31', '2026-11-15')).toBe('kedaluwarsa');
  });

  it('marks an end date inside the next 7 days as "segera"', () => {
    expect(eventStatus('2026-11-20', '2026-11-15')).toBe('segera');
  });

  it('marks an end date on the boundary of 7 days as "segera"', () => {
    expect(eventStatus('2026-11-22', '2026-11-15')).toBe('segera');
  });

  it('marks a far-future end date as active', () => {
    expect(eventStatus('2027-01-01', '2026-11-15')).toBe('aktif');
  });

  it('treats a missing end date as tanpa-batas', () => {
    expect(eventStatus(null, '2026-11-15')).toBe('tanpa-batas');
    expect(eventStatus(undefined, '2026-11-15')).toBe('tanpa-batas');
  });
});

describe('sortEventsByUrgency', () => {
  const today = '2026-11-15';
  const ev = (id: number, berlakuSampai?: string | null) => ({ id, berlakuSampai });

  it('puts expired events last, after active and tanpa-batas ones', () => {
    const sorted = sortEventsByUrgency([ev(1, '2026-10-01'), ev(2, null), ev(3, '2027-01-01')], today);
    expect(sorted.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('orders active events by nearest expiry first', () => {
    const sorted = sortEventsByUrgency(
      [ev(1, '2026-12-31'), ev(2, '2026-11-18'), ev(3, '2026-11-16')],
      today,
    );
    expect(sorted.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('keeps input order for equal deadlines', () => {
    const sorted = sortEventsByUrgency([ev(1, '2026-12-01'), ev(2, '2026-12-01')], today);
    expect(sorted.map((e) => e.id)).toEqual([1, 2]);
  });

  it('leaves a single-element list unchanged', () => {
    expect(sortEventsByUrgency([ev(9, '2026-12-01')], today).map((e) => e.id)).toEqual([9]);
  });
});

describe('countdownLabel', () => {
  it('returns null when there is no end date', () => {
    expect(countdownLabel(null, '2026-11-15')).toBeNull();
    expect(countdownLabel(undefined, '2026-11-15')).toBeNull();
  });

  it('returns null for an expired event (its chip already carries that state)', () => {
    expect(countdownLabel('2026-10-31', '2026-11-15')).toBeNull();
  });

  it('labels same-day expiry', () => {
    expect(countdownLabel('2026-11-15', '2026-11-15')).toBe('berakhir hari ini');
  });

  it('labels tomorrow expiry', () => {
    expect(countdownLabel('2026-11-16', '2026-11-15')).toBe('besok berakhir');
  });

  it('labels a multi-day countdown', () => {
    expect(countdownLabel('2026-12-31', '2026-11-15')).toBe('46 hari lagi');
  });
});

// Real-today helper mirroring the component's wibToday() (UTC+7, never local
// zone), so countdown assertions stay deterministic regardless of the sandbox TZ.
function localTodayISO(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

describe('EventsView countdown', () => {
  it('renders an emphasized countdown on an active promo with an end date', () => {
    const today = localTodayISO();
    const day3 = shiftDay(today, 3);
    mockState({ events: [{ ...base, id: 30, judul: 'Promo 3 hari', berlakuSampai: day3 }] });
    render(<EventsView />);
    expect(screen.getByText(/3 hari lagi/)).toBeTruthy();
  });

  it('does not render a countdown on an expired promo', () => {
    mockState({ events: [{ ...base, id: 31, judul: 'Promo basi', berlakuSampai: '2020-01-01' }] });
    render(<EventsView />);
    expect(screen.queryByText(/hari lagi/)).toBeNull();
    expect(screen.queryByText(/berakhir/)).toBeNull();
  });
});

describe('EventsView expiry chips', () => {
  it('renders a Kedaluwarsa chip and dims an expired event card', async () => {
    const expired: PromoEvent = {
      ...base,
      id: 9,
      judul: 'Promo lama',
      berlakuSampai: '2020-01-01',
    };
    mockState({ events: [expired] });
    render(<EventsView />);
    await waitFor(() => expect(screen.getByText('Kedaluwarsa')).toBeTruthy());
    const li = screen.getByText('Kedaluwarsa').closest('li');
    expect((li?.className ?? '')).toContain('opacity-55');
  });

  it('renders an Aktif chip for an in-date event', async () => {
    const active: PromoEvent = {
      ...base,
      id: 10,
      judul: 'Promo jangka panjang',
      berlakuSampai: '2099-12-31',
    };
    mockState({ events: [active] });
    render(<EventsView />);
    await waitFor(() => expect(screen.getByText('Aktif')).toBeTruthy());
  });
});

describe('EventsView hide-expired toggle', () => {
  it('hides expired promos when the toggle is on, keeps them when off', async () => {
    const expired: PromoEvent = { ...base, id: 20, judul: 'Promo basi', berlakuSampai: '2020-01-01' };
    const active: PromoEvent = { ...base, id: 21, judul: 'Promo segar', berlakuSampai: '2099-12-31' };
    mockState({ events: [expired, active] });
    render(<EventsView />);

    // Default: both visible.
    await waitFor(() => expect(screen.getByText('Promo basi')).toBeTruthy());
    expect(screen.getByText('Promo segar')).toBeTruthy();

    // Turn the toggle on: expired disappears, active remains.
    fireEvent.click(screen.getByRole('button', { name: /Sembunyikan kedaluwarsa/ }));
    await waitFor(() => expect(screen.queryByText('Promo basi')).toBeNull());
    expect(screen.getByText('Promo segar')).toBeTruthy();

    // Toggle off restores the expired promo.
    fireEvent.click(screen.getByRole('button', { name: /Sembunyikan kedaluwarsa/ }));
    await waitFor(() => expect(screen.getByText('Promo basi')).toBeTruthy());
  });

  it('empty-state mentions the active-only filter when hiding expired', async () => {
    const expired: PromoEvent = { ...base, id: 22, judul: 'Promo basi', berlakuSampai: '2020-01-01' };
    mockState({ events: [expired] });
    render(<EventsView />);
    fireEvent.click(screen.getByRole('button', { name: /Sembunyikan kedaluwarsa/ }));
    await waitFor(() => expect(screen.getByText(/Belum ada event.*yang masih aktif/)).toBeTruthy());
  });

  it('the toggle button is a 44px target with aria-pressed state', async () => {
    mockState();
    render(<EventsView />);
    const btn = screen.getByRole('button', { name: /Sembunyikan kedaluwarsa/ });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('min-h-[44px]');
  });
});

describe('EventsView urgency ordering', () => {
  it('renders the most urgent promo first within a group', () => {
    const today = localTodayISO();
    const far = shiftDay(today, 20);
    const soon = shiftDay(today, 2);
    mockState({
      events: [
        { ...base, id: 41, judul: 'Promo jauh', berlakuSampai: far },
        { ...base, id: 42, judul: 'Promo dekat', berlakuSampai: soon },
        { ...grab, id: 43, judul: 'Promo Grab', berlakuSampai: far },
      ],
    });
    render(<EventsView />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Promo dekat', 'Promo jauh', 'Promo Grab']);
  });
});
