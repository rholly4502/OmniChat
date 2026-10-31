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
});
