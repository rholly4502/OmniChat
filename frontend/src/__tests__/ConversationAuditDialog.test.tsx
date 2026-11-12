import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConversationAuditDialog } from '../components/ConversationAuditDialog';
import type { ChatSession, ModelOption } from '../types';

const { downloadBlob } = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../conversationExport', () => ({
  downloadBlob,
  safeFilenameSlug: (t: string) => t.toLowerCase().replace(/\s+/g, '-'),
}));

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
    expect(screen.getAllByText('Claude Sonnet').length).toBeGreaterThanOrEqual(1); // resolved via modelOptions (header + per-model row)
    expect(screen.getByText('Agent (Hermes)')).toBeInTheDocument();
    expect(screen.getByText('4 pesan')).toBeInTheDocument();
    expect(screen.getAllByText('Pengguna').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Asisten').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a Waktu (timestamp) column header', () => {
    renderOpen();
    expect(screen.getByRole('columnheader', { name: 'Waktu' })).toBeInTheDocument();
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

  it('renders a tally of up/down ratings and bookmarks in the meta strip', () => {
    renderOpen();
    // SESSION: one 'up', one 'down', no bookmarks → tallies 1 and 1; bookmark hidden.
    const up = screen.getByTitle('Disukai');
    expect(up).toBeInTheDocument();
    expect(up.textContent).toContain('1');
    const down = screen.getByTitle('Tidak disukai');
    expect(down).toBeInTheDocument();
    expect(down.textContent).toContain('1');
    expect(screen.queryByTitle('Ditandai')).not.toBeInTheDocument();
  });

  it('shows a bookmark tally when the conversation has bookmarked turns', () => {
    const bm: ChatSession = {
      ...SESSION,
      messages: [
        { role: 'user', content: 'Halo', createdAt: 1 },
        { role: 'assistant', content: 'Balasan', bookmarked: true, createdAt: 2 },
      ],
    };
    renderOpen(vi.fn(), bm);
    // The bookmark appears both as a per-row indicator (aria-label) and as the
    // meta-strip tally (title). Assert the tally carries the count.
    const marks = screen.getAllByTitle('Ditandai');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks.some((el) => el.textContent?.includes('1'))).toBe(true);
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

  it('renders a per-model breakdown when a conversation spans several models', () => {
    const multiModel: ChatSession = {
      ...SESSION,
      model: 'claude-sonnet',
      messages: [
        {
          role: 'assistant',
          content: 'Satu',
          usage: { promptTokens: 10, completionTokens: 20 },
          model: 'claude-sonnet',
          createdAt: 1,
        },
        {
          role: 'assistant',
          content: 'Dua',
          usage: { promptTokens: 2, completionTokens: 4 },
          model: 'claude-haiku',
          createdAt: 2,
        },
      ],
    };
    renderOpen(vi.fn(), multiModel);
    expect(screen.getByText('Rincian per model')).toBeInTheDocument();
    // claude-sonnet appears in the meta header AND the per-model row
    expect(screen.getAllByText('Claude Sonnet').length).toBeGreaterThanOrEqual(2);
    // unknown model resolved to its raw id label (table Model cell + per-model row)
    expect(screen.getAllByText('claude-haiku').length).toBeGreaterThanOrEqual(1);
    // per-row totals: 10+20=30 and 2+4=6
    const onT = screen.getAllByText('30');
    expect(onT.length).toBeGreaterThanOrEqual(1);
    const sixT = screen.getAllByText('6');
    expect(sixT.length).toBeGreaterThanOrEqual(1);
    // footer totals: prompt 12, completion 24
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('24').length).toBeGreaterThanOrEqual(1);
  });

  it('omits the per-model section when no message carries usage', () => {
    const noUsage: ChatSession = {
      ...SESSION,
      messages: [
        { role: 'user', content: 'Tanpa usage', createdAt: 1 },
        { role: 'assistant', content: 'Juga tanpa usage', createdAt: 2 },
      ],
    };
    renderOpen(vi.fn(), noUsage);
    expect(screen.queryByText('Rincian per model')).not.toBeInTheDocument();
  });
});

describe('ConversationAuditDialog CSV export', () => {
  it('exports a well-formed CSV with header, per-message rows and the Total row', async () => {
    renderOpen();
    const btn = screen.getByRole('button', { name: 'Ekspor audit sebagai CSV' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toBe('deploy-audit.csv');
    expect(blob).toBeInstanceOf(Blob);
    const csv = await blob.text();
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('peran,pesan,model,prompt_tokens,completion_tokens,biaya_usd,umpan_balik,berpikir,ditandai,waktu');
    expect(lines[1]).toContain('1,Pengguna,Halo,Claude Sonnet');
    const asst = lines.find((l) => l.includes('Asisten,Hai! Ini balasan asisten') && l.includes('10,20'));
    expect(asst).toBeTruthy();
    expect(asst).toContain('up');
    const total = lines.find((l) => l.startsWith('Total'));
    expect(total).toContain('14,22');
  });

  it('close & export icon buttons carry pressed-state + transition micro-interaction', () => {
    renderOpen();
    const close = screen.getByRole('button', { name: 'Tutup audit' });
    expect(close).toHaveClass('active:bg-chill-elevated');
    expect(close).toHaveClass('transition');
    const exportCsv = screen.getByRole('button', { name: 'Ekspor audit sebagai CSV' });
    expect(exportCsv).toHaveClass('active:bg-chill-elevated');
    expect(exportCsv).toHaveClass('transition');
  });
});

describe('ConversationAuditDialog model/reasoning/bookmark attribution', () => {
  const rich: ChatSession = {
    id: 'sess-rich',
    title: 'Kaya',
    model: 'claude-sonnet',
    mode: 'agent',
    createdAt: 0,
    updatedAt: 0,
    messages: [
      {
        role: 'assistant',
        content: 'Beres',
        usage: { promptTokens: 5, completionTokens: 3 },
        model: 'claude-haiku',
        reasoning: 'Pertimbangkan dulu.',
        bookmarked: true,
        createdAt: 2,
      },
    ],
  };

  it('renders a Model column and Lain indicators for reasoning + bookmark', () => {
    renderOpen(vi.fn(), rich);
    expect(screen.getAllByRole('columnheader', { name: 'Model' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('columnheader', { name: 'Lain' })).toBeInTheDocument();
    expect(screen.getAllByText('claude-haiku').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Berisi cara berpikir')).toBeInTheDocument();
    expect(screen.getByLabelText('Ditandai')).toBeInTheDocument();
  });

  it('CSV export includes model, berpikir and ditandai columns', async () => {
    downloadBlob.mockClear();
    renderOpen(vi.fn(), rich);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor audit sebagai CSV' }));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob] = downloadBlob.mock.calls[0];
    const csv = await blob.text();
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('peran,pesan,model,prompt_tokens,completion_tokens,biaya_usd,umpan_balik,berpikir,ditandai,waktu');
    const asst = lines.find((l) => l.includes('Asisten,Beres,claude-haiku,5,3'));
    expect(asst).toBeTruthy();
    expect(asst).toContain(',1,1');
  });
});

describe('ConversationAuditDialog message expand/collapse', () => {
  const longMsg: ChatSession = {
    id: 'sess-long',
    title: 'Panjang',
    model: 'claude-sonnet',
    mode: 'agent',
    createdAt: 0,
    updatedAt: 0,
    messages: [
      { role: 'user', content: 'Halo', createdAt: 1 },
      {
        role: 'assistant',
        content: 'Ini adalah balasan yang sangat panjang sehingga melebihi ambang preview 72 karakter dan harus bisa dibaca utuh setelah diperluas — kalimat ini sengaja dibuat jauh lebih panjang dari batas truncation.',
        reasoning: 'Pertimbangkan dulu dengan hati-hati.',
        usage: { promptTokens: 10, completionTokens: 20 },
        model: 'claude-sonnet',
        createdAt: 2,
      },
    ],
  };

  it('shows a truncated preview by default and a toggle button per row', () => {
    renderOpen(vi.fn(), longMsg);
    // The full content is not present until expanded.
    expect(screen.queryByText(/melebihi ambang preview 72 karakter/)).not.toBeInTheDocument();
    const btns = screen.getAllByRole('button', { name: 'Tampilkan pesan lengkap' });
    expect(btns.length).toBeGreaterThanOrEqual(1);
    expect(btns[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to full content (and reasoning) and collapses again', () => {
    renderOpen(vi.fn(), longMsg);
    // The toggle lives in the assistant row that carries the long preview; the
    // first row (user 'Halo') has its own toggle, so scope by row not by index.
    const asstRow = screen.getByText(/Ini adalah balasan yang sangat panjang/).closest('tr');
    expect(asstRow).not.toBeNull();
    const expand = within(asstRow as HTMLElement).getByRole('button', { name: 'Tampilkan pesan lengkap' });
    fireEvent.click(expand);
    expect(screen.getByText(/melebihi ambang preview 72 karakter/)).toBeInTheDocument();
    expect(screen.getByText('Cara berpikir')).toBeInTheDocument();
    expect(screen.getByText('Pertimbangkan dulu dengan hati-hati.')).toBeInTheDocument();
    const collapse = within(asstRow as HTMLElement).getByRole('button', { name: 'Sembunyikan pesan lengkap' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(screen.queryByText(/melebihi ambang preview 72 karakter/)).not.toBeInTheDocument();
  });

  it('keeps export (CSV/JSON) unaffected by expansion state', async () => {
    downloadBlob.mockClear();
    renderOpen(vi.fn(), longMsg);
    const asstRow = screen.getByText(/Ini adalah balasan yang sangat panjang/).closest('tr');
    fireEvent.click(within(asstRow as HTMLElement).getByRole('button', { name: 'Tampilkan pesan lengkap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor audit sebagai CSV' }));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob] = downloadBlob.mock.calls[0];
    const csv = await blob.text();
    const lines = csv.split('\r\n');
    const asst = lines.find((l) => l.includes('Asisten,Ini adalah balasan yang sangat panjang') && l.includes('10,20'));
    expect(asst).toBeTruthy();
  });
});

describe('ConversationAuditDialog JSON export', () => {
  const jsonRich: ChatSession = {
    id: 'sess-json-rich',
    title: 'Kaya',
    model: 'claude-sonnet',
    mode: 'agent',
    createdAt: 0,
    updatedAt: 0,
    messages: [
      {
        role: 'assistant',
        content: 'Beres',
        usage: { promptTokens: 5, completionTokens: 3 },
        model: 'claude-haiku',
        reasoning: 'Pertimbangkan dulu.',
        bookmarked: true,
        createdAt: 2,
      },
    ],
  };

  it('exports a well-formed JSON with per-message rows, total and per-model subtotals', async () => {
    downloadBlob.mockClear();
    renderOpen();
    const btn = screen.getByRole('button', { name: 'Ekspor audit sebagai JSON' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toBe('deploy-audit.json');
    expect(blob).toBeInstanceOf(Blob);
    const raw = await blob.text();
    const json = JSON.parse(raw);
    expect(json.judul).toBe('Deploy');
    expect(json.model).toBe('Claude Sonnet');
    expect(json.mode).toBe('agent');
    expect(json.pesan).toHaveLength(4);
    expect(json.pesan[0]).toMatchObject({ no: 1, peran: 'Pengguna', pesan: 'Halo' });
    const asst = json.pesan.find((r) => r.peran === 'Asisten' && r.pesan.includes('Hai! Ini balasan asisten'));
    expect(asst).toBeTruthy();
    expect(asst.prompt_tokens).toBe(10);
    expect(asst.completion_tokens).toBe(20);
    expect(asst.umpan_balik).toBe('up');
    expect(json.total.prompt_tokens).toBe(14);
    expect(json.total.completion_tokens).toBe(22);
    expect(json.per_model.length).toBeGreaterThanOrEqual(1);
  });

  it('JSON export includes model, berpikir and ditandai fields', async () => {
    downloadBlob.mockClear();
    renderOpen(vi.fn(), jsonRich);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor audit sebagai JSON' }));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob] = downloadBlob.mock.calls[0];
    const raw = await blob.text();
    const json = JSON.parse(raw);
    expect(json.pesan).toHaveLength(1);
    const row = json.pesan[0];
    expect(row).toMatchObject({ model: 'claude-haiku', berpikir: true, ditandai: true });
    expect(row.prompt_tokens).toBe(5);
    expect(row.completion_tokens).toBe(3);
  });
});
