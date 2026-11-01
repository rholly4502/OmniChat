import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PixelProgress } from '../components/PixelProgress';

function blocks(container: HTMLElement) {
  return Array.from(container.querySelectorAll('div.flex-1'));
}

describe('PixelProgress', () => {
  it('renders segmented blocks: filled at the front, empty behind', () => {
    const { container } = render(<PixelProgress percent={50} segments={10} />);
    const b = blocks(container);
    expect(b).toHaveLength(10);
    expect(b[0].className).toContain('bg-chill-accent');
    expect(b[4].className).toContain('bg-chill-accent');
    expect(b[5].className).toContain('bg-chill-border/30');
    expect(b[9].className).toContain('bg-chill-border/30');
  });

  it('clamps percent to 0–100', () => {
    const { container } = render(<PixelProgress percent={150} segments={5} />);
    const b = blocks(container);
    expect(b[4].className).toContain('bg-chill-accent');
    const empty = render(<PixelProgress percent={-20} segments={5} />);
    expect(blocks(empty.container)[0].className).toContain('bg-chill-border/30');
  });

  it('supports red tone for over-budget', () => {
    const { container } = render(<PixelProgress percent={100} tone="red" segments={4} />);
    const b = blocks(container);
    expect(b[0].className).toContain('bg-chill-red');
  });

  it('is decorative (aria-hidden) with square, hard-edge track', () => {
    const { container } = render(<PixelProgress percent={30} />);
    const track = container.querySelector('div[aria-hidden="true"]');
    expect(track?.className).toContain('rounded-none');
    expect(track?.className).toContain('border-chill-border');
  });
});
