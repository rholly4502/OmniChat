import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from '../components/TypingIndicator';

describe('TypingIndicator', () => {
  it('exposes an accessible status label', () => {
    render(<TypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menunggu respons');
  });

  it('renders the pixel scan loader blocks inside a decorative aria-hidden row', () => {
    const { container } = render(<TypingIndicator />);
    const row = container.querySelector('span[aria-hidden="true"]');
    expect(row).not.toBeNull();
    const blocks = row!.querySelectorAll('span.pixel-scan');
    expect(blocks).toHaveLength(8);
  });

  it('staggers the scan blocks so the highlight sweeps', () => {
    const { container } = render(<TypingIndicator />);
    const row = container.querySelector('span[aria-hidden="true"]');
    const blocks = [...row!.querySelectorAll('span.pixel-scan')];
    const delays = blocks.map((b) => b.style.animationDelay);
    expect(delays[0]).toBe('0ms');
    expect(delays[1]).toBe('125ms');
    expect(delays[delays.length - 1]).toBe('875ms');
  });

  it('renders server-provided status text and updates accessible label', () => {
    render(<TypingIndicator status="Menyusun jawaban" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menyusun jawaban');
    expect(screen.getByText('Menyusun jawaban…')).toBeInTheDocument();
  });

  it('shows the processing model label and folds it into the accessible label', () => {
    render(<TypingIndicator status="Menyusun jawaban" modelLabel="Hermes (Default)" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menyusun jawaban · Hermes (Default)');
    expect(screen.getByText('· Hermes (Default)')).toBeInTheDocument();
  });
});
