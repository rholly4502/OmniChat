import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationAuditDialog } from '../components/ConversationAuditDialog';
import type { ChatSession, ModelOption } from '../types';

const MODELS: ModelOption[] = [{ id: 'claude-sonnet', label: 'Claude Sonnet' }];

const SESSION: ChatSession = {
  id: 'sess-1',
  title: 'Deploy',
  model: 'claude-sonnet',
  mode: 'agent',
  createdAt: 0,
  updatedAt: 0,
  messages: [
    { role: 'user', content: 'Halo', createdAt: 1 },
    {
      role: 'assistant',
      content: 'Hai! Ini balasan asisten yang cukup panjang untuk menguji preview dan biaya.',
      usage: { promptTokens: 10, completionTokens: 20 },
      model: 'claude-sonnet',
      feedback: 'up',
      createdAt: 2,
    },
    { role: 'user', content: 'Apa itu OmniChat?', createdAt: 3 },
    {
      role: 'assistant',
      content: 'Aplikasi chat hybrid.',
      usage: { promptTokens: 4, completionTokens: 2 },
      feedback: 'down',
      createdAt: 4,
    },
  ],
};

function renderOpen(onClose = vi.fn(), session: ChatSession | null = SESSION) {
  return render(<ConversationAuditDialog open onClose={onClose} session={session} modelOptions={MODELS} />);
}

describe('ConversationAuditDialog', () => {
  it('renders nothing when closed or session is null', () => {
    const a = render(<ConversationAuditDialog open={false} onClose={vi.fn()} session={SESSION} />);
    expect(a.container).toBeEmptyDOMElement();
    const b = render(<ConversationAuditDialog open onClose={vi.fn()} session={null} />);
    expect(b.container).toBeEmptyDOMElement();
  });

  it('renders the title, meta (model label, mode, count) and role labels', () => {
    renderOpen();
    expect(screen.getByRole('dialog', { name: 'Audit percakapan Deploy' })).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument(); // resolved via modelOptions
    expect(screen.getByText('Agent (Hermes)')).toBeInTheDocument();
    expect(screen.getByText('4 pesan')).toBeInTheDocument();
    expect(screen.getAllByText('Pengguna').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Asisten').length).toBeGreaterThanOrEqual(2);
  });

  it('renders per-message token/cost columns and totals', () => {
    renderOpen();
    const text = (t: string) => screen.getAllByText(t);
    // assistant msg: in 10, out 20
    expect(text('10').length).toBeGreaterThanOrEqual(1);
    expect(text('20').length).toBeGreaterThanOrEqual(1);
    // second assistant msg: in 4, out 2 (each may also appear as a row index)
    expect(text('4').length).toBeGreaterThanOrEqual(1);
    expect(text('2').length).toBeGreaterThanOrEqual(1);
    // footer in/out totals: 10+4 = 14 prompt, 20+2 = 22 completion
    expect(text('14').length).toBeGreaterThanOrEqual(1);
    expect(text('22').length).toBeGreaterThanOrEqual(1);
    // claude-sonnet 10/20 → 0.00033 ≈ $0.0003 (row header, no space)
    expect(text('≈$0.0003').length).toBeGreaterThanOrEqual(1);
    // footer ≈ across both rows: 0.00033 + 0.000042 = 0.000372 ≈ $0.0004
    expect(text('≈$0.0004').length).toBeGreaterThanOrEqual(1);
  });

  it('shows placedholders for messages without usage', () => {
    renderOpen();
    const dashes = screen.getAllByText('–');
    expect(dashes.length).toBeGreaterThanOrEqual(4); // user rows: In/Out/Biaya/Nilai
  });

  it('renders feedback markers from stored ratings', () => {
    renderOpen();
    expect(screen.getByLabelText('Disukai')).toBeInTheDocument();
    expect(screen.getByLabelText('Tidak disukai')).toBeInTheDocument();
  });

  it('close button and Escape invoke onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup audit' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows an empty-state message for a conversation without messages', () => {
    renderOpen(vi.fn(), { ...SESSION, messages: [] });
    expect(screen.getByText('Belum ada pesan dalam percakapan ini.')).toBeInTheDocument();
  });
});
