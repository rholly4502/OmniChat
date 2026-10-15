import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SidebarOverlay } from '../components/SidebarOverlay';

/**
 * Unit tests for the mobile drawer backdrop (frontend decomposition step 9).
 */
describe('SidebarOverlay', () => {
  it('is a decorative backdrop hidden from assistive tech', () => {
    const { container } = render(<SidebarOverlay onClose={() => {}} />);
    const backdrop = container.firstElementChild as HTMLElement;
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });

  it('covers the viewport and is mobile-only', () => {
    const { container } = render(<SidebarOverlay onClose={() => {}} />);
    const backdrop = container.firstElementChild as HTMLElement;
    expect(backdrop.className).toContain('fixed');
    expect(backdrop.className).toContain('inset-0');
    expect(backdrop.className).toContain('md:hidden');
  });

  it('closes the drawer when tapped', () => {
    const onClose = vi.fn();
    const { container } = render(<SidebarOverlay onClose={onClose} />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
