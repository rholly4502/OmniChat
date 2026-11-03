import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTopBar } from '../components/MobileTopBar';

/**
 * Unit tests for the extracted mobile top bar (frontend decomposition step 9).
 * The hamburger's aria wiring is load-bearing: `aria-controls` targets the
 * sidebar's `id`, and `aria-expanded` reports drawer state.
 */
function renderBar(overrides: Partial<Parameters<typeof MobileTopBar>[0]> = {}) {
  const props = {
    sidebarOpen: false,
    onOpenSidebar: vi.fn(),
    useAgent: true,
    menuButtonRef: createRef<HTMLButtonElement>(),
    ...overrides,
  };
  return { ...render(<MobileTopBar {...props} />), props };
}

describe('MobileTopBar', () => {
  it('renders the hamburger with its accessible name and sidebar wiring', () => {
    renderBar();
    const button = screen.getByLabelText('Open menu');
    expect(button).toHaveAttribute('aria-controls', 'chat-sidebar');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('reports the drawer as expanded when open', () => {
    renderBar({ sidebarOpen: true });
    expect(screen.getByLabelText('Open menu')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the drawer on click', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(props.onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('attaches the injected ref to the hamburger so focus can be restored', () => {
    const { props } = renderBar();
    expect(props.menuButtonRef.current).toBe(screen.getByLabelText('Open menu'));
  });

  it('labels the active mode and swaps the badge icon with it', () => {
    const agent = renderBar({ useAgent: true });
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('OmniChat')).toBeInTheDocument();
    // hamburger svg + mode badge icon + decorative easter-egg fish
    expect(agent.container.querySelectorAll('svg')).toHaveLength(3);
    agent.unmount();

    renderBar({ useAgent: false });
    expect(screen.getByText('Direct')).toBeInTheDocument();
  });

  it('is hidden from the md breakpoint up, where the sidebar is static', () => {
    const { container } = renderBar();
    expect((container.firstElementChild as HTMLElement).className).toContain('md:hidden');
  });

  it('guest variant shows a logout button and no hamburger', () => {
    const onLogout = vi.fn();
    renderBar({ isGuest: true, onLogout });
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('guest variant advertises direct mode and never the agent badge', () => {
    renderBar({ isGuest: true, useAgent: true });
    expect(screen.getByText(/Guest · Direct/)).toBeInTheDocument();
    expect(screen.getByText(/Guest · Direct/).className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
  });

  it('guest variant keeps the logout control at the 44px touch floor', () => {
    renderBar({ isGuest: true });
    const logout = screen.getByRole('button', { name: 'Keluar' });
    expect(logout.className).toContain('min-h-[44px]');
    expect(logout.className).toContain('min-w-[44px]');
    expect(logout.className).toContain('focus-visible:ring-2');
    expect(logout.className).toContain('text-sm');
  });

  it('applies the chill pixel-art treatment (warm palette, chunky edges, pixel brand)', () => {
    const { container } = renderBar();
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain('bg-chill-bg');
    expect(bar.className).toContain('border-chill-border');
    const brand = screen.getByText('OmniChat');
    expect(brand.className).toContain('pixel-heading');
    expect(brand.className).toContain('text-chill-accent');
    const burger = screen.getByLabelText('Open menu');
    expect(burger.className).toContain('rounded-none');
    expect(burger.className).toContain('focus-visible:ring-chill-accent/60');
  });
  it('hides a decorative deep-sea pixel fish beside the brand until hover (easter egg)', () => {
    const { container } = renderBar();
    const fish = Array.from(container.querySelectorAll('svg')).find(
      (s) => s.getAttribute('aria-hidden') === 'true' && s.className.baseVal?.includes('chill-deepsea'),
    );
    expect(fish).toBeDefined();
    expect(fish!.getAttribute('aria-hidden')).toBe('true');
    expect(fish!.getAttribute('class')).toContain('opacity-0');
    expect(fish!.getAttribute('class')).toContain('group-hover:opacity-100');
    expect(fish!.getAttribute('class')).toContain('group-focus-within:opacity-100');
    expect(fish!.hasAttribute('role')).toBe(false);
    expect(fish!.hasAttribute('tabindex')).toBe(false);
  });

  it('on the Pengeluaran view shows a pixel view chip and hides chat telemetry', () => {
    renderBar({ activeView: 'expenses' });
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
    const chip = screen.getByText('Pengeluaran');
    expect(chip.className).toContain('pixel-heading');
    expect(chip.className).toContain('bg-chill-elevated');
    expect(chip.className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
  });

  it('renders the active model label beside the mode badge in the admin header', () => {
    renderBar({ model: 'hermes-default', modelLabel: 'Hermes Default' });
    expect(screen.getByText('Hermes Default')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('guest variant appends the active model label to the Guest · Direct badge', () => {
    renderBar({ isGuest: true, modelLabel: 'DeepSeek' });
    expect(screen.getByText(/Guest · Direct · DeepSeek/)).toBeInTheDocument();
  });

  it('omits the model label when none is provided', () => {
    renderBar();
    expect(screen.queryByText(/Hermes|DeepSeek/)).not.toBeInTheDocument();
  });

  it('renders a compact model switcher when a catalog and change handler are supplied', () => {
    const onChange = vi.fn();
    const catalog = [
      { id: 'hermes-default', label: 'Hermes Default' },
      { id: 'claude-sonnet', label: 'Claude Sonnet' },
    ];
    renderBar({ models: catalog, onModelChange: onChange });
    const select = screen.getByLabelText('Ganti model') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('hermes-default');
    expect(screen.getByRole('option', { name: 'Claude Sonnet' })).toBeInTheDocument();
  });

  it('fires onModelChange when the mobile switcher selects a model', () => {
    const onChange = vi.fn();
    const catalog = [
      { id: 'hermes-default', label: 'Hermes Default' },
      { id: 'claude-sonnet', label: 'Claude Sonnet' },
    ];
    renderBar({ models: catalog, onModelChange: onChange, model: 'hermes-default' });
    fireEvent.change(screen.getByLabelText('Ganti model'), { target: { value: 'claude-sonnet' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('claude-sonnet');
  });

  it('falls back to the static model label when no switcher handler is provided', () => {
    renderBar({ model: 'hermes-default', modelLabel: 'Hermes Default', models: [{ id: 'hermes-default', label: 'Hermes Default' }] });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByText('Hermes Default')).toBeInTheDocument();
  });

  it('renders the model switcher as a 44px touch target', () => {
    const onChange = vi.fn();
    const catalog = [{ id: 'hermes-default', label: 'Hermes Default' }];
    renderBar({ models: catalog, onModelChange: onChange });
    const select = screen.getByLabelText('Ganti model');
    expect(select.className).toContain('min-h-[44px]');
    expect(select.className).toContain('text-base');
  });

  it('guest variant never shows the model switcher', () => {
    const onChange = vi.fn();
    const catalog = [{ id: 'hermes-default', label: 'Hermes Default' }];
    renderBar({ isGuest: true, models: catalog, onModelChange: onChange });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Keluar')).toBeInTheDocument();
  });
});
