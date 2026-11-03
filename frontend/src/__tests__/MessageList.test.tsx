import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageList } from '../components/MessageList';
import type { Message, ModelOption } from '../types';

const MODELS: ModelOption[] = [
  { id: 'hermes', label: 'Hermes (Default)' },
  { id: 'other', label: 'Other Model' },
];

function renderList(overrides: {
  messages?: Message[];
  streaming?: boolean;
  models?: ModelOption[];
  model?: string;
  useAgent?: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (index: number, newContent: string) => void;
  onSetFeedback?: (messageId: string, feedback: 'up' | 'down' | null) => Promise<boolean>;
  onSelectSuggestion?: (prompt: string) => void;
} = {}) {
  const scrollRef = createRef<HTMLDivElement>();
  const view = render(
    <MessageList
      messages={overrides.messages ?? []}
      streaming={overrides.streaming ?? false}
      models={overrides.models ?? MODELS}
      model={overrides.model ?? 'hermes'}
      useAgent={overrides.useAgent ?? true}
      scrollRef={scrollRef}
      onRegenerate={overrides.onRegenerate}
      onEditMessage={overrides.onEditMessage}
      onSetFeedback={overrides.onSetFeedback}
      onSelectSuggestion={overrides.onSelectSuggestion}
    />
  );
  return { ...view, scrollRef };
}

describe('MessageList', () => {
  it('is a polite live region labelled for assistive tech', () => {
    renderList();
    const region = screen.getByLabelText('Chat messages');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('marks itself busy only while streaming', () => {
    const { unmount } = renderList({ streaming: true });
    expect(screen.getByLabelText('Chat messages')).toHaveAttribute('aria-busy', 'true');
    unmount();

    renderList({ streaming: false });
    expect(screen.getByLabelText('Chat messages')).toHaveAttribute('aria-busy', 'false');
  });

  it('attaches the injected scroll ref to the scroll container', () => {
    const { scrollRef } = renderList();
    expect(scrollRef.current).not.toBeNull();
    expect(scrollRef.current).toBe(screen.getByLabelText('Chat messages'));
  });

  it('renders a decorative pixel-art ornament in the empty state', () => {
    const { container } = renderList();
    // No messages => the only svg on screen is the aria-hidden ornament.
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
    // Hard-edged pixel register: uses rects, never circles (no <circle>).
    expect(svg?.querySelector('circle')).toBeNull();
  });

  it('names the active mode and model in the empty state', () => {
    renderList({ model: 'other' });
    expect(screen.getByText(/Mulai chat/)).toBeInTheDocument();
    expect(screen.getByText(/Agent \(Hermes\)/)).toBeInTheDocument();
    expect(screen.getByText(/Other Model/)).toBeInTheDocument();
  });

  it('names Direct mode in the empty state when the bridge is off', () => {
    renderList({ useAgent: false });
    expect(screen.getByText(/Direct \(LLM\)/)).toBeInTheDocument();
  });

  it('renders the user turn as plain text, preserving line breaks', () => {
    const { container } = renderList({ messages: [{ role: 'user', content: 'baris satu\nbaris dua' }] });
    const bubble = container.querySelector('span.whitespace-pre-wrap');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe('baris satu\nbaris dua');
  });

  it('aligns the user turn right and the assistant turn left', () => {
    const { container } = renderList({
      messages: [
        { role: 'user', content: 'hai' },
        { role: 'assistant', content: 'halo' },
      ],
    });
    const rows = [...container.querySelectorAll('div.flex')];
    expect(rows[0].className).toContain('justify-end');
    expect(rows[1].className).toContain('justify-start');
  });

  it('renders assistant markdown', () => {
    const { container } = renderList({ messages: [{ role: 'assistant', content: '**tebal**' }] });
    expect(container.querySelector('strong')?.textContent).toBe('tebal');
  });

  it('shows the typing indicator while an assistant turn is still empty', () => {
    renderList({ messages: [{ role: 'assistant', content: '' }] });
    // Default harness model is 'hermes', which resolves to 'Hermes (Default)'.
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Menunggu respons · Hermes (Default)');
  });

  it('names the model processing the reply in the typing indicator', () => {
    renderList({ messages: [{ role: 'assistant', content: '' }], model: 'other' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Menunggu respons · Other Model');
  });

  it('does not show the typing indicator once content has arrived', () => {
    renderList({ messages: [{ role: 'assistant', content: 'sudah ada' }] });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a fenced code block through CodeBlock so it gets a copy button', () => {
    renderList({ messages: [{ role: 'assistant', content: '```js\nconst x = 1;\n```' }] });
    expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
  });

  it('wraps GFM tables for horizontal scrolling on narrow screens', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { container } = renderList({ messages: [{ role: 'assistant', content: md }] });
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.parentElement?.className).toContain('overflow-x-auto');
  });

  it('lazy-loads and async-decodes markdown images', () => {
    const { container } = renderList({
      messages: [{ role: 'assistant', content: '![alt](https://example.com/a.png)' }],
    });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('keeps the mobile-first message width and scaling classes', () => {
    const { container } = renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    const bubble = container.querySelector('div.max-w-\\[85\\%\\]');
    expect(bubble?.className).toContain('md:max-w-[75%]');
    expect(bubble?.className).toContain('rounded-none');
  });

  it('renders a copy message button on assistant turns', () => {
    renderList({ messages: [{ role: 'assistant', content: 'Halo dari asisten' }] });
    expect(screen.getByRole('button', { name: 'Salin pesan' })).toBeInTheDocument();
  });

  it('inherits the footer typography instead of hard-coding sub-12px meta text', () => {
    // The author label and the copy label used to carry `text-[11px]`, and the
    // author label `text-slate-500` (3.75:1 on the assistant bubble -- below AA).
    // Both now inherit, so the footer itself has to keep supplying the floor.
    const { container } = renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    const author = [...container.querySelectorAll('span')].find((el) => el.textContent === 'OmniChat');
    expect(author).toBeTruthy();
    expect(author?.className ?? '').not.toContain('text-[11px]');
    expect(author?.className ?? '').not.toContain('text-slate-500');

    const footer = container.querySelector('div.border-t');
    expect(footer?.className).toContain('text-xs');
    expect(footer?.className).toContain('text-chill-muted');
  });

  it('gives the copy button a 44px touch target on mobile', () => {
    // With px-2 py-0.5 around a 12px icon this measured 56x19 on a phone.
    renderList({ messages: [{ role: 'assistant', content: 'Halo dari asisten' }] });
    const btn = screen.getByRole('button', { name: 'Salin pesan' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  // ─── regenerate (Coba lagi) ────────────────────────────────
  it('shows a regenerate button on the trailing assistant message when idle', () => {
    const onRegenerate = vi.fn();
    renderList({
      messages: [
        { role: 'user', content: 'hai' },
        { role: 'assistant', content: 'halo' },
      ],
      onRegenerate,
    });
    const btn = screen.getByRole('button', { name: 'Coba lagi' });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('hides the regenerate button while streaming', () => {
    renderList({
      messages: [
        { role: 'user', content: 'hai' },
        { role: 'assistant', content: 'halo' },
      ],
      streaming: true,
      onRegenerate: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
  });

  it('only shows regenerate on the final assistant message', () => {
    renderList({
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ],
      onRegenerate: vi.fn(),
    });
    expect(screen.getAllByRole('button', { name: 'Coba lagi' })).toHaveLength(1);
  });

  it('does not render a regenerate button when no handler is provided', () => {
    renderList({
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ],
    });
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
  });

  // ─── edit / resend ─────────────────────────────────────────
  it('shows an edit button on user turns when a handler is provided', () => {
    renderList({
      messages: [{ role: 'user', content: 'hai' }],
      onEditMessage: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Edit pesan' })).toBeInTheDocument();
  });

  it('does not show an edit button without a handler', () => {
    renderList({ messages: [{ role: 'user', content: 'hai' }] });
    expect(screen.queryByRole('button', { name: 'Edit pesan' })).not.toBeInTheDocument();
  });

  it('opens an inline editor pre-filled with the message text when Edit is clicked', () => {
    renderList({
      messages: [{ role: 'user', content: 'teks asli' }],
      onEditMessage: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    const editor = screen.getByLabelText('Edit pesan');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveValue('teks asli');
  });

  it('save submits the edited text and closes the editor', () => {
    const onEditMessage = vi.fn();
    renderList({
      messages: [{ role: 'user', content: 'teks asli' }],
      onEditMessage,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    const editor = screen.getByLabelText('Edit pesan');
    fireEvent.change(editor, { target: { value: 'teks baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & kirim' }));

    expect(onEditMessage).toHaveBeenCalledWith(0, 'teks baru');
    expect(screen.queryByRole('textbox', { name: 'Edit pesan' })).not.toBeInTheDocument();
  });

  it('cancel closes the editor without submitting', () => {
    const onEditMessage = vi.fn();
    renderList({
      messages: [{ role: 'user', content: 'teks asli' }],
      onEditMessage,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

    expect(onEditMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Edit pesan' })).not.toBeInTheDocument();
  });

  it('disables save while the draft is empty', () => {
    renderList({
      messages: [{ role: 'user', content: 'teks asli' }],
      onEditMessage: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    const editor = screen.getByLabelText('Edit pesan');
    fireEvent.change(editor, { target: { value: '   ' } });
    const save = screen.getByRole('button', { name: 'Simpan & kirim' });
    expect(save).toBeDisabled();
  });

  // ─── like / dislike feedback (local) ─────────────────────────────
  it('offers like/dislike feedback on assistant replies', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    expect(screen.getByRole('button', { name: 'Suka' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tidak suka' })).toBeInTheDocument();
  });

  it('does not put feedback buttons on user turns', () => {
    renderList({ messages: [{ role: 'user', content: 'halo' }] });
    expect(screen.queryByRole('button', { name: 'Suka' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tidak suka' })).not.toBeInTheDocument();
  });

  it('toggles like on click and clears on second click', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    const like = screen.getByRole('button', { name: 'Disukai' });
    expect(like).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(like);
    expect(screen.queryByRole('button', { name: 'Disukai' })).not.toBeInTheDocument();
  });

  it('switches from like to dislike in one click', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tidak suka' }));
    expect(screen.getByRole('button', { name: 'Tidak disukai' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Disukai' })).not.toBeInTheDocument();
  });

  it('persists like via onSetFeedback when the message has a server id', async () => {
    const onSetFeedback = vi.fn().mockResolvedValue(true);
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo' }],
      onSetFeedback,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    await waitFor(() => expect(onSetFeedback).toHaveBeenCalledWith('m0', 'up'));
    expect(screen.getByRole('button', { name: 'Disukai' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls the optimistic toggle back when persisting fails', async () => {
    const onSetFeedback = vi.fn().mockResolvedValue(false);
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo' }],
      onSetFeedback,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Disukai' })).not.toBeInTheDocument(),
    );
    expect(onSetFeedback).toHaveBeenCalledWith('m0', 'up');
  });

  it('does not call onSetFeedback for a draft message without an id', () => {
    const onSetFeedback = vi.fn();
    renderList({
      messages: [{ role: 'assistant', content: 'halo' }],
      onSetFeedback,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    expect(screen.getByRole('button', { name: 'Disukai' })).toHaveAttribute('aria-pressed', 'true');
    expect(onSetFeedback).not.toHaveBeenCalled();
  });

  it('reflects a rating already persisted on the server', () => {
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo', feedback: 'down' }],
    });
    expect(screen.getByRole('button', { name: 'Tidak disukai' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Suka' })).toHaveAttribute('aria-pressed', 'false');
  });

  // ─── per-message cost footnote ──────────────────────────────────
  it('renders a token/cost footnote on an assistant reply with usage', () => {
    renderList({
      model: 'hermes',
      messages: [{ role: 'assistant', content: 'halo', usage: { promptTokens: 1000, completionTokens: 500 } }],
    });
    // 1500 tokens -> "1.5k", hermes rate 0.002/0.008 per 1K -> ≈$0.006
    expect(screen.getByText(/1\.5k tok ≈/)).toBeInTheDocument();
  });

  it('prices the footnote with the model that produced the message, not the selected one', () => {
    // The message was produced by claude-sonnet (0.003/0.015 per 1K) while the
    // selector now shows hermes (0.002/0.008). 1000 in + 500 out:
    //   claude: 0.003 + 0.0075 = 0.0105 -> "$0.01"
    //   hermes: 0.002 + 0.004   = 0.006  -> "$0.0060"
    renderList({
      model: 'hermes',
      messages: [{
        role: 'assistant',
        content: 'halo',
        model: 'claude-sonnet',
        usage: { promptTokens: 1000, completionTokens: 500 },
      }],
    });
    expect(screen.getByText(/1\.5k tok ≈ \$0\.01$/)).toBeInTheDocument();
  });

  it('omits the footnote when no usage is present', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    expect(screen.queryByText(/tok ≈/)).not.toBeInTheDocument();
  });

  it('omits the footnote when usage is all zero', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo', usage: { promptTokens: 0, completionTokens: 0 } }] });
    expect(screen.queryByText(/tok ≈/)).not.toBeInTheDocument();
  });

  // ─── copy message as JSON ───────────────────────────────────────
  it('copies an assistant reply as JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ role: 'assistant', content: 'halo' }, null, 2));
  });

  it('includes model, usage, cost and feedback in the JSON copy when present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({
      model: 'hermes',
      messages: [{
        role: 'assistant',
        content: 'halo',
        id: 'm1',
        model: 'claude-sonnet',
        feedback: 'up',
        usage: { promptTokens: 1000, completionTokens: 500 },
      }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const written = JSON.parse(writeText.mock.calls[0][0]);
    expect(written).toMatchObject({
      role: 'assistant',
      content: 'halo',
      id: 'm1',
      model: 'claude-sonnet',
      feedback: 'up',
      usage: { promptTokens: 1000, completionTokens: 500 },
    });
    expect(typeof written.estimatedCostUsd).toBe('number');
    expect(written.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('falls back to the selected model when pricing usage without an owning model', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({
      model: 'hermes',
      messages: [{
        role: 'assistant',
        content: 'halo',
        usage: { promptTokens: 10, completionTokens: 5 },
      }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const written = JSON.parse(writeText.mock.calls[0][0]);
    expect(written.model).toBeUndefined();
    expect(written.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(written.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('shows a transient copied confirmation for JSON', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    expect(await screen.findByRole('button', { name: 'JSON tersalin' })).toBeInTheDocument();
  });
});

describe('MessageList focus-mode hooks', () => {
  it('marks the decorative empty-state chrome as focus-hidden', () => {
    const { container } = renderList();
    const hidden = container.querySelectorAll('[class*="focus-hidden"]');
    expect(hidden.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the footer brand behind focus-hidden so focus mode can drop it', () => {
    const { container } = renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    const hiddenText = [...container.querySelectorAll('span.focus-hidden')].map((el) => el.textContent);
    expect(hiddenText).toContain('OmniChat');
  });
});

describe('MessageList quick-start suggestions', () => {
  it('renders agent-mode suggestion chips in the empty state', () => {
    renderList({ useAgent: true, onSelectSuggestion: vi.fn() });
    const group = screen.getByRole('group', { name: 'Mulai cepat' });
    expect(group).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-agent-architecture')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-direct-cleanarch')).not.toBeInTheDocument();
  });

  it('renders direct-mode suggestions when useAgent is false', () => {
    renderList({ useAgent: false, onSelectSuggestion: vi.fn() });
    expect(screen.getByTestId('suggestion-direct-cleanarch')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-agent-architecture')).not.toBeInTheDocument();
  });

  it('does not render suggestions when no handler is provided', () => {
    renderList({ useAgent: true });
    // renderList omits onSelectSuggestion by default
    expect(screen.queryByRole('group', { name: 'Mulai cepat' })).not.toBeInTheDocument();
  });

  it('inserts the chosen prompt into the composer via the callback', () => {
    const onSelectSuggestion = vi.fn();
    renderList({ useAgent: true, onSelectSuggestion });
    fireEvent.click(screen.getByTestId('suggestion-agent-architecture'));
    expect(onSelectSuggestion).toHaveBeenCalledTimes(1);
    expect(onSelectSuggestion).toHaveBeenCalledWith(expect.stringContaining('microservices'));
  });
});

describe('MessageList timestamps', () => {
  it('shows a localized time for a message with createdAt', () => {
    const ts = Date.parse('2026-11-03T07:05:00+00:00');
    const { container } = renderList({
      messages: [
        { role: 'user', content: 'hai', createdAt: ts },
        { role: 'assistant', content: 'halo', createdAt: ts },
      ],
    });
    const stamps = [...container.querySelectorAll('[aria-label^="Dikirim"]')];
    expect(stamps).toHaveLength(2);
    expect(stamps[0].textContent).toBeTruthy();
    expect(stamps[1].textContent).toBeTruthy();
  });

  it('renders no timestamp when createdAt is absent', () => {
    const { container } = renderList({
      messages: [{ role: 'user', content: 'hai' }],
    });
    expect(container.querySelector('[aria-label^="Dikirim"]')).toBeNull();
  });
});
