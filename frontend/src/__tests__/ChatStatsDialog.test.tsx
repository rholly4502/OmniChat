import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatStatsDialog } from '../components/ChatStatsDialog';
import type { ConversationUsageSummary } from '../types';

const USAGE: ConversationUsageSummary = {
  totalPromptTokens: 1000,
  totalCompletionTokens: 1000,
  totalTokens: 2000,
  conversationCount: 3,
  totalUpFeedback: 4,
  totalDownFeedback: 1,
  byModel: {
    'claude-sonnet': { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 },
    'unknown-model': { promptTokens: 500, completionTokens: 250, totalTokens: 750 },
  },
};

const MODELS = [{ id: 'claude-sonnet', label: 'Claude Sonnet' }];

function renderOpen(onClose = vi.fn()) {
  return render(<ChatStatsDialog open onClose={onClose} usage={USAGE} modelOptions={MODELS} />);
}

describe('ChatStatsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ChatStatsDialog open={false} onClose={vi.fn()} usage={USAGE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the summary stats', () => {
    renderOpen();
    expect(screen.getByRole('dialog', { name: 'Statistik Chat' })).toBeInTheDocument();
    expect(screen.getAllByText('2k').length).toBeGreaterThanOrEqual(1); // total tokens (summary + table)
    expect(screen.getByText('≈ $0.02')).toBeInTheDocument(); // claude-sonnet 1000/1000 → 0.018 ≈ $0.02
    expect(screen.getByText('3')).toBeInTheDocument(); // conversation count
    expect(screen.getByText('4')).toBeInTheDocument(); // up feedback
    expect(screen.getByText('1')).toBeInTheDocument(); // down feedback
  });

  it('renders per-model rows, resolving known labels and falling back to raw ids', () => {
    renderOpen();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    expect(screen.getByText('unknown-model')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument(); // claude-sonnet share
  });

  it('close button invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup statistik' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    const backdrop = document.body.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the close button when opened and locks body scroll, restoring on unmount', () => {
    const { unmount } = renderOpen();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tutup statistik' }));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders per-model rows most-expensive-first (cost descending)', () => {
    renderOpen();
    // claude-sonnet (≈$0.02) must appear above unknown-model (≈$0.0015)
    const rows = screen.getAllByRole('row');
    const labels = rows.map((r) => r.textContent ?? '');
    const sonnetIdx = labels.findIndex((t) => t.includes('Claude Sonnet'));
    const unknownIdx = labels.findIndex((t) => t.includes('unknown-model'));
    expect(sonnetIdx).toBeGreaterThanOrEqual(0);
    expect(unknownIdx).toBeGreaterThan(sonnetIdx);
  });
});
