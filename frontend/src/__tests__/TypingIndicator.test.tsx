import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  it('renders a thinking status without double-counting the ellipsis', () => {
    render(<TypingIndicator status="Berpikir…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Berpikir…');
    expect(screen.getByText('Berpikir…')).toBeInTheDocument();
  });

  it('switches to the think-loader animation while the model is reasoning', () => {
    const { container } = render(<TypingIndicator status="Berpikir…" />);
    expect(container.querySelectorAll('span.pixel-think')).toHaveLength(8);
    expect(container.querySelector('span.pixel-scan')).toBeNull();
  });
});


describe('TypingIndicator elapsed timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show an elapsed readout before one second', () => {
    vi.useFakeTimers();
    render(<TypingIndicator status="Menyusun jawaban" />);
    expect(screen.queryByText(/· \d+s/)).not.toBeInTheDocument();
  });

  it('ticks upward every second while streaming', () => {
    vi.useFakeTimers();
    render(<TypingIndicator status="Menyusun jawaban" />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('· 3s')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('· 5s')).toBeInTheDocument();
  });

  it('keeps the accessible live region unchanged by the ticking readout', () => {
    vi.useFakeTimers();
    render(<TypingIndicator status="Menyusun jawaban" modelLabel="Hermes (Default)" />);
    act(() => { vi.advanceTimersByTime(4000); });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Menyusun jawaban · Hermes (Default)');
    const elapsed = screen.getByText('· 4s');
    expect(elapsed).toHaveAttribute('aria-hidden', 'true');
    expect(status).not.toContainElement(elapsed);
  });

  it('stops ticking when unmounted', () => {
    vi.useFakeTimers();
    const view = render(<TypingIndicator status="Menyusun jawaban" />);
    view.unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText(/· \d+s/)).not.toBeInTheDocument();
  });
});

