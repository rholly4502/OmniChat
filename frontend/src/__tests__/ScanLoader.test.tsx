import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScanLoader } from '../components/ScanLoader';

describe('ScanLoader', () => {
  it('renders 8 pixel-scan blocks by default', () => {
    const { container } = render(<ScanLoader />);
    const blocks = container.querySelectorAll('.pixel-scan');
    expect(blocks.length).toBe(8);
    // Each block sits on the chill accent register, same as the typing indicator.
    expect(blocks[0].className).toContain('bg-chill-accent');
  });

  it('honours an explicit block count', () => {
    const { container } = render(<ScanLoader blocks={4} />);
    expect(container.querySelectorAll('.pixel-scan').length).toBe(4);
  });

  it('is decorative and hidden from the accessibility tree', () => {
    const { container } = render(<ScanLoader />);
    const row = container.querySelector('.inline-flex');
    expect(row?.getAttribute('aria-hidden')).toBe('true');
  });
});
