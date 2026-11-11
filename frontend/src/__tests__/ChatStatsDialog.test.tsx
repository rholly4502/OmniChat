import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const { downloadBlob } = vi.hoisted(() => ({ downloadBlob: vi.fn() }));

describe('ChatStatsDialog CSV export', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../conversationExport', () => ({ downloadBlob, safeFilenameSlug: (t: string) => t }));
  });

  it('exports a well-formed CSV with header, per-model rows and a Total row', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} />);
    const btn = screen.getByRole('button', { name: 'Ekspor statistik sebagai CSV' });
    fireEvent.click(btn);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toBe('statistik-chat.csv');
    const csv = await blob.text();
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe('model,prompt_tokens,completion_tokens,total_tokens,biaya_usd');
    expect(lines.some((l) => l.startsWith('Claude Sonnet,1000,1000,2000,0.018000'))).toBe(true);
    expect(lines.some((l) => l.startsWith('unknown-model,500,250,750,0.001500'))).toBe(true);
    expect(lines[lines.length - 1]).toBe('Total,1000,1000,2000,0.019500');
  });
});


describe('ChatStatsDialog bulk export', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../historyApi', () => ({
      listAllConversations: vi.fn().mockResolvedValue([
        { id: 'c1', title: 'A', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', mode: 'agent', model: 'hermes', isPinned: false },
        { id: 'c2', title: 'B', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', mode: 'direct', model: 'gpt', isPinned: false },
      ]),
      getConversation: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(
          id === 'c1'
            ? {
                id: 'c1', title: 'A', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', mode: 'agent', model: 'hermes', isPinned: false,
                messages: [{ id: 'm1', role: 'user' as const, content: 'halo', createdAt: '2026-11-01T00:00:00Z' }],
              }
            : {
                id: 'c2', title: 'B', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', mode: 'direct', model: 'gpt', isPinned: false,
                messages: [{ id: 'm2', role: 'assistant' as const, content: 'hai', createdAt: '2026-11-02T00:00:00Z', model: 'gpt', promptTokens: 4, completionTokens: 6 }],
              },
        ),
      ),
    }));
    vi.doMock('../conversationExport', () => ({
      downloadBlob,
      buildAllConversationsJson: (r: unknown[]) => JSON.stringify({ conversations: r }),
      buildAllConversationsCsv: () => 'csv-data',
    }));
  });

  it('exports all conversations as JSON, fetching each detail once', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor semua percakapan sebagai JSON' }));
    const before = downloadBlob.mock.calls.length;
    await waitFor(() => expect(downloadBlob.mock.calls.length).toBe(before + 1));
    const [blob, filename] = downloadBlob.mock.calls[before];
    expect(filename).toBe('semua-percakapan.json');
    const parsed = JSON.parse(await (blob as Blob).text());
    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[1].messages[0].completionTokens).toBe(6);
  });

  it('exports all conversations as CSV', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor semua percakapan sebagai CSV' }));
    const before = downloadBlob.mock.calls.length;
    await waitFor(() => expect(downloadBlob.mock.calls.length).toBe(before + 1));
    const [, filename] = downloadBlob.mock.calls[before];
    expect(filename).toBe('semua-percakapan.csv');
  });

  it('close & export icon buttons carry pressed-state + transition micro-interaction', () => {
    renderOpen();
    const close = screen.getByRole('button', { name: 'Tutup statistik' });
    expect(close).toHaveClass('active:bg-chill-elevated');
    expect(close).toHaveClass('transition');
    const exportCsv = screen.getByRole('button', { name: 'Ekspor statistik sebagai CSV' });
    expect(exportCsv).toHaveClass('active:bg-chill-elevated');
    expect(exportCsv).toHaveClass('transition');
  });

});


const { getUsageMock } = vi.hoisted(() => ({ getUsageMock: vi.fn() }));

describe('ChatStatsDialog period filter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../historyApi', () => ({
      getConversationUsage: getUsageMock,
      listAllConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
    }));
  });

  afterEach(() => {
    getUsageMock.mockClear();
  });

  it('renders the period filter controls', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);
    expect(screen.getByLabelText('Tanggal awal periode statistik')).toBeInTheDocument();
    expect(screen.getByLabelText('Tanggal akhir periode statistik')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terapkan periode statistik' })).toBeInTheDocument();
  });

  it('fetching a scoped window renders the scoped summary and a period note', async () => {
    const scoped = {
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalTokens: 15,
      conversationCount: 1,
      totalUpFeedback: 0,
      totalDownFeedback: 0,
      byModel: { 'claude-sonnet': { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    };
    getUsageMock.mockResolvedValue(scoped);

    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);

    fireEvent.change(screen.getByLabelText('Tanggal awal periode statistik'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Tanggal akhir periode statistik'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan periode statistik' }));

    await waitFor(() => expect(getUsageMock).toHaveBeenCalled());
    expect(getUsageMock).toHaveBeenCalledWith(
      { apiKey: 'k' },
      { from: '2026-10-01', to: '2026-10-31' },
    );
    // The scoped summary (15 tokens) replaces the lifetime total (2000).
    await waitFor(() => expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(/Periode 2026-10-01 s.d. 2026-10-31/)).toBeInTheDocument();
    expect(screen.getByText(/2k total sepanjang masa/)).toBeInTheDocument();
  });

  it('clearing the window restores the lifetime summary', async () => {
    const scoped = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      conversationCount: 0,
      totalUpFeedback: 0,
      totalDownFeedback: 0,
      byModel: {},
    };
    getUsageMock.mockResolvedValue(scoped);

    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);

    fireEvent.change(screen.getByLabelText('Tanggal awal periode statistik'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan periode statistik' }));
    await waitFor(() => expect(screen.getByText(/Periode 2026-10-01 s.d./)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Bersihkan periode statistik' }));
    await waitFor(() => expect(screen.queryByText(/Periode 2026-10-01/)).not.toBeInTheDocument());
    expect(screen.getAllByText('2k').length).toBeGreaterThanOrEqual(1);
  });

  it('apply button shows pixel loading feedback while fetching a scoped window', async () => {
    let release!: (v: unknown) => void;
    const gate = new Promise((res) => { release = res; });
    getUsageMock.mockReturnValueOnce(gate as never);

    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);
    fireEvent.change(screen.getByLabelText('Tanggal awal periode statistik'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan periode statistik' }));

    const btn = screen.getByRole('button', { name: 'Terapkan periode statistik' });
    expect(btn.querySelector('.pixel-scan')).not.toBeNull();
    expect(btn.textContent).toContain('Memuat');

    release({ totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, conversationCount: 0, totalUpFeedback: 0, totalDownFeedback: 0, byModel: {} });
    await waitFor(() => expect(getUsageMock).toHaveBeenCalledTimes(1));
  });
});


const { filteredListMock } = vi.hoisted(() => ({ filteredListMock: vi.fn() }));

describe('ChatStatsDialog filtered bulk export', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../historyApi', () => ({
      listAllConversations: filteredListMock,
      getConversation: vi.fn().mockResolvedValue({
        id: 'c1', title: 'A', createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z', mode: 'direct', model: 'gpt',
        isPinned: false,
        messages: [{ id: 'm1', role: 'user', content: 'halo', createdAt: '2026-11-01T00:00:00Z' }],
      }),
    }));
    vi.doMock('../conversationExport', () => ({
      downloadBlob,
      buildAllConversationsJson: (r: unknown[]) => JSON.stringify({ conversations: r }),
      buildAllConversationsCsv: () => 'csv-data',
    }));
    filteredListMock.mockClear();
    filteredListMock.mockResolvedValue([
      { id: 'c1', title: 'A', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', mode: 'direct', model: 'gpt', isPinned: false },
    ]);
  });

  it('passes the active filters + search to the bulk export and labels it accordingly', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(
      <Dialog
        open
        onClose={vi.fn()}
        usage={USAGE}
        modelOptions={MODELS}
        apiKey="k"
        search="halo"
        filters={{ model: 'gpt', mode: 'direct', from: '2026-11-01', to: '2026-11-30' }}
      />,
    );
    expect(screen.getByText('Ekspor percakapan sesuai filter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor semua percakapan sebagai JSON' }));
    const before = downloadBlob.mock.calls.length;
    await waitFor(() => expect(downloadBlob.mock.calls.length).toBe(before + 1));
    expect(filteredListMock).toHaveBeenCalledWith(
      { apiKey: 'k' },
      'halo',
      { model: 'gpt', mode: 'direct', from: '2026-11-01', to: '2026-11-30' },
    );
  });

  it('keeps the "all conversations" label when no filters are active', async () => {
    const { ChatStatsDialog: Dialog } = await import('../components/ChatStatsDialog');
    render(<Dialog open onClose={vi.fn()} usage={USAGE} modelOptions={MODELS} apiKey="k" />);
    expect(screen.getByText('Ekspor semua percakapan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor semua percakapan sebagai JSON' }));
    const before = downloadBlob.mock.calls.length;
    await waitFor(() => expect(downloadBlob.mock.calls.length).toBe(before + 1));
    expect(filteredListMock).toHaveBeenCalledWith({ apiKey: 'k' }, undefined, undefined);
  });
});
