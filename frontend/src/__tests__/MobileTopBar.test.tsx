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
    // hamburger svg + mode badge icon
    expect(agent.container.querySelectorAll('svg')).toHaveLength(2);
    agent.unmount();

    renderBar({ useAgent: false });
    expect(screen.getByText('Direct')).toBeInTheDocument();
  });

  it('is hidden from the md breakpoint up, where the sidebar is static', () => {
    const { container } = renderBar();
    expect((container.firstElementChild as HTMLElement).className).toContain('md:hidden');
  });
});
