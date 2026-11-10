import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventsView } from '../components/EventsView';
import type { PromoEvent } from '../eventsApi';

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
