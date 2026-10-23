import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from '../components/TypingIndicator';

/**
 * The messages container is `aria-busy="true"` while streaming, which
 * suppresses announcements for anything inside it. The indicator must
 * therefore own a live region of its own, or screen-reader users get no
 * feedback that a reply has started.
 */
describe('TypingIndicator', () => {
  it('exposes an accessible status label', () => {
    render(<TypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menunggu respons');
  });

  it('renders three decorative dots, each hidden from assistive tech', () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(3);
    dots.forEach((dot) => expect(dot.className).toContain('animate-pulse'));
  });

  it('staggers the dots so the pulse reads as a motion, not a blink', () => {
    const { container } = render(<TypingIndicator />);
    const dots = [...container.querySelectorAll('span[aria-hidden="true"]')];
    expect(dots[0].className).not.toContain('animation-delay');
    expect(dots[1].className).toContain('[animation-delay:200ms]');
    expect(dots[2].className).toContain('[animation-delay:400ms]');
  });

  it('renders server-provided status text and updates accessible label', () => {
    render(<TypingIndicator status="Menyusun jawaban" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menyusun jawaban');
    expect(screen.getByText('Menyusun jawaban…')).toBeInTheDocument();
  });
});
