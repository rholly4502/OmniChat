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
  onSetBookmark?: (messageId: string, isBookmarked: boolean) => Promise<boolean>;
  onDeleteMessage?: (messageId: string) => Promise<boolean>;
  onSelectSuggestion?: (prompt: string) => void;
  onQuote?: (content: string) => void;
  conversationKey?: string;
  searchSignal?: number;
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
      onSetBookmark={overrides.onSetBookmark}
      onDeleteMessage={overrides.onDeleteMessage}
      onSelectSuggestion={overrides.onSelectSuggestion}
      onQuote={overrides.onQuote}
      conversationKey={overrides.conversationKey}
      searchSignal={overrides.searchSignal}
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

  it('shows a collapsible Berpikir disclosure for an assistant message with reasoning', () => {
    const messages: Message[] = [
      { role: 'user', content: 'q', createdAt: 1 },
      { role: 'assistant', content: 'answer', reasoning: 'thinking step one', createdAt: 2 },
    ];
    renderList({ messages });
    const toggle = screen.getByRole('button', { name: /Berpikir/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The reasoning body (a <div> carrying the full text) is hidden until expanded.
    // The button's own preview <span> also contains the text, so target the body div.
    const bodyId = 'reasoning-1';
    expect(document.getElementById(bodyId)).toBeNull();
    fireEvent.click(toggle);
    expect(document.getElementById(bodyId)).toBeTruthy();
    expect(document.getElementById(bodyId)?.textContent).toContain('thinking step one');
    // The revealed body uses the app's stepped reveal entrance animation.
    expect(document.getElementById(bodyId)).toHaveClass('pixel-reveal');
    expect(screen.getByRole('button', { name: /Berpikir/ })).toHaveAttribute('aria-expanded', 'true');
    // Toggle again to collapse.
    fireEvent.click(screen.getByRole('button', { name: /Berpikir/ }));
    expect(document.getElementById(bodyId)).toBeNull();
  });

  it('omits the reasoning disclosure when the assistant message has no reasoning', () => {
    const messages: Message[] = [
      { role: 'user', content: 'q', createdAt: 1 },
      { role: 'assistant', content: 'answer', createdAt: 2 },
    ];
    renderList({ messages });
    expect(screen.queryByRole('button', { name: /Berpikir/ })).toBeNull();
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
    const rows = [...container.querySelectorAll('[data-msg-index]')];
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

  // ─── message bookmarks (local + persisted) ─────────────────────
  it('offers a bookmark toggle on assistant replies', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    expect(screen.getByRole('button', { name: 'Tandai pesan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tandai pesan' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers a bookmark toggle on user turns', () => {
    renderList({ messages: [{ role: 'user', content: 'halo' }] });
    expect(screen.getByRole('button', { name: 'Tandai pesan' })).toBeInTheDocument();
  });

  it('toggles bookmark on click (local)', () => {
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Tandai pesan' }));
    const star = screen.getByRole('button', { name: 'Ditandai' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(star);
    expect(screen.queryByRole('button', { name: 'Ditandai' })).not.toBeInTheDocument();
  });

  it('persists bookmark via onSetBookmark when the message has a server id', async () => {
    const onSetBookmark = vi.fn().mockResolvedValue(true);
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo' }],
      onSetBookmark,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tandai pesan' }));
    await waitFor(() => expect(onSetBookmark).toHaveBeenCalledWith('m0', true));
    expect(screen.getByRole('button', { name: 'Ditandai' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls the optimistic bookmark back when persisting fails', async () => {
    const onSetBookmark = vi.fn().mockResolvedValue(false);
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo' }],
      onSetBookmark,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tandai pesan' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Ditandai' })).not.toBeInTheDocument(),
    );
    expect(onSetBookmark).toHaveBeenCalledWith('m0', true);
  });

  it('does not call onSetBookmark for a draft message without an id', () => {
    const onSetBookmark = vi.fn();
    renderList({
      messages: [{ role: 'assistant', content: 'halo' }],
      onSetBookmark,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tandai pesan' }));
    expect(screen.getByRole('button', { name: 'Ditandai' })).toHaveAttribute('aria-pressed', 'true');
    expect(onSetBookmark).not.toHaveBeenCalled();
  });

  it('reflects a bookmark already persisted on the server', () => {
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo', bookmarked: true }],
    });
    expect(screen.getByRole('button', { name: 'Ditandai' })).toHaveAttribute('aria-pressed', 'true');
  });
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

  it('copies an assistant reply as Markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({
      messages: [{
        role: 'assistant',
        content: 'halo',
        reasoning: 'pikir 1\npikir 2',
      }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salin Markdown' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith([
      '### Asisten', '',
      'halo', '',
      '> **Berpikir:**', '',
      '> pikir 1',
      '> pikir 2',
    ].join('\n'));
  });

  it('shows a transient Markdown-copied confirmation', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin Markdown' }));
    expect(await screen.findByRole('button', { name: 'Markdown tersalin' })).toBeInTheDocument();
  });

  it('keeps JSON, plain-text and Markdown copy confirmations independent', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin Markdown' }));
    expect(await screen.findByRole('button', { name: 'Markdown tersalin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'JSON tersalin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pesan tersalin' })).not.toBeInTheDocument();
  });
});

describe('MessageList user-message copy actions', () => {
  it('copies a user message as JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({ messages: [{ role: 'user', content: 'hai saya nanya sesuatu' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ role: 'user', content: 'hai saya nanya sesuatu' }, null, 2));
  });

  it('includes the server id when present but never model/usage/cost for a user turn', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({
      model: 'hermes',
      messages: [{ id: 'u1', role: 'user', content: 'hai' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const written = JSON.parse(writeText.mock.calls[0][0]);
    expect(written).toEqual({ role: 'user', content: 'hai', id: 'u1' });
  });

  it('copies a user message as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({ messages: [{ role: 'user', content: 'teks apa adanya' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin pesan' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('teks apa adanya');
  });

  it('shows a transient copied confirmation for a user message', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({ messages: [{ role: 'user', content: 'hai' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    expect(await screen.findByRole('button', { name: 'JSON tersalin' })).toBeInTheDocument();
  });

  it('opens markdown links in a new tab with noopener noreferrer', () => {
    const { container } = renderList({
      messages: [{ role: 'assistant', content: 'Baca [dokumen](https://example.com/docs) ya' }],
    });
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('https://example.com/docs');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps JSON and plain-text copy confirmations independent', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({ messages: [{ role: 'assistant', content: 'halo' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin sebagai JSON' }));
    expect(await screen.findByRole('button', { name: 'JSON tersalin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pesan tersalin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salin pesan' })).toBeInTheDocument();
  });

  it('copies a user message as Markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({ messages: [{ role: 'user', content: 'hai' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Salin Markdown' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(['### Pengguna', '', 'hai', ''].join('\n'));
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
  it('does not leak feedback or edit state across conversation switches', () => {
    const onSetFeedback = vi.fn().mockResolvedValue(true);
    const view = renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'halo' }],
      onSetFeedback,
      conversationKey: 'conv-A',
    });
    // Like the assistant reply in conversation A.
    fireEvent.click(screen.getByRole('button', { name: 'Suka' }));
    expect(screen.getByRole('button', { name: 'Disukai' })).toHaveAttribute('aria-pressed', 'true');

    // Switch to a different conversation sharing the same message index. The
    // transient feedback must NOT carry over — the new message is unrated.
    view.rerender(
      <MessageList
        messages={[{ id: 'm1', role: 'assistant', content: 'halo lain' }]}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={view.scrollRef}
        onSetFeedback={onSetFeedback}
        conversationKey="conv-B"
      />
    );
    expect(screen.getByRole('button', { name: 'Suka' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Disukai' })).not.toBeInTheDocument();
    expect(onSetFeedback).toHaveBeenCalledTimes(1);
  });

  it('keeps in-progress edit state only within the same conversation', () => {
    const onEditMessage = vi.fn();
    const view = renderList({
      messages: [{ role: 'user', content: 'teks asli' }],
      onEditMessage,
      conversationKey: 'conv-A',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    expect(screen.getByRole('textbox', { name: 'Edit pesan' })).toBeInTheDocument();

    // Switching conversations closes the editor even though index 0 is a user turn.
    view.rerender(
      <MessageList
        messages={[{ role: 'user', content: 'teks lain' }]}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={view.scrollRef}
        onEditMessage={onEditMessage}
        conversationKey="conv-B"
      />
    );
    expect(screen.queryByRole('textbox', { name: 'Edit pesan' })).not.toBeInTheDocument();
  });

});

describe('MessageList jump-to-bottom affordance', () => {
  const msgs = (): Message[] => [
    { role: 'user', content: 'Apa itu?' },
    { role: 'assistant', content: 'Jawaban panjang'.repeat(40) },
  ];

  function setScrollMetrics(el: HTMLElement, height: number, client: number, top: number) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: client });
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: top });
  }

  it('is hidden on first paint (no scroll offset)', () => {
    renderList({ messages: msgs() });
    expect(screen.queryByRole('button', { name: 'Lompat ke bawah' })).not.toBeInTheDocument();
  });

  it('appears when the reader scrolls away from the bottom', () => {
    const { scrollRef } = renderList({ messages: msgs() });
    const el = scrollRef.current!;
    setScrollMetrics(el, 1000, 200, 100); // far from bottom => show
    fireEvent.scroll(el);
    expect(screen.getByRole('button', { name: 'Lompat ke bawah' })).toBeInTheDocument();
  });

  it('stays hidden when tall content is pinned at the bottom', () => {
    const { scrollRef } = renderList({ messages: msgs() });
    const el = scrollRef.current!;
    setScrollMetrics(el, 1000, 200, 800); // at/near bottom => hide
    fireEvent.scroll(el);
    expect(screen.queryByRole('button', { name: 'Lompat ke bawah' })).not.toBeInTheDocument();
  });

  it('jumps to the bottom when clicked', () => {
    const { scrollRef } = renderList({ messages: msgs() });
    const el = scrollRef.current!;
    setScrollMetrics(el, 1000, 200, 100);
    fireEvent.scroll(el);
    const scrollSpy = vi.spyOn(el, 'scrollTo').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Lompat ke bawah' }));
    expect(scrollSpy).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });
  });
});

describe('MessageList in-transcript search', () => {
  const msgset = (): Message[] => [
    { role: 'user', content: 'bagaimana cara hemat token?' },
    { role: 'assistant', content: 'Token hemat dengan ringkas.' },
    { role: 'user', content: 'cara lain selain token?' },
  ];

  const openSearch = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cari di percakapan' }));
  };

  it('reveals the search toolbar from the floating toggle', () => {
    renderList({ messages: msgset() });
    openSearch();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
  });

  it('highlights literal matches inside user bubbles and reports the total count', () => {
    const { container } = renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    // "token" appears in both user turns; assistant markdown is not injected with inline marks
    expect(container.querySelectorAll('mark').length).toBe(2);
    expect(screen.getByText('1 dari 3 pesan')).toBeInTheDocument();
  });

  it('shows a no-match state and disables navigation', () => {
    renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'zzz' } });
    expect(screen.getByText('Tidak ada yang cocok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
  });

  it('steps through matching messages with prev/next and marks the active row', () => {
    // jsdom lacks Element.prototype.scrollIntoView; the component guards it with
    // an optional call, so we only assert the active-row transition here.
    renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    const activeIndex = () => {
      const rows = [...screen.getByLabelText('Chat messages').querySelectorAll('[data-msg-index]')];
      const active = rows.filter((r) => r.getAttribute('data-active') === 'true');
      return active.map((r) => Number(r.getAttribute('data-msg-index')));
    };
    expect(activeIndex()).toEqual([0]);
    expect(screen.getByText('1 dari 3 pesan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    expect(activeIndex()).toEqual([1]);
    expect(screen.getByText('2 dari 3 pesan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sebelumnya' }));
    expect(activeIndex()).toEqual([0]);
    expect(screen.getByText('1 dari 3 pesan')).toBeInTheDocument();
  });

  it('closes the toolbar and clears highlights', () => {
    const { container } = renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    expect(container.querySelectorAll('mark').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup pencarian' }));
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(container.querySelectorAll('mark').length).toBe(0);
  });

  it('keeps assistant markdown intact while searching', () => {
    renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'ringkas' } });
    // the assistant reply still renders through markdown unmodified (no injected <mark>)
    expect(screen.getByText(/Token hemat/)).toBeInTheDocument();
  });

  it('searches reasoning text in addition to visible content', () => {
    const msgs: Message[] = [
      { role: 'assistant', content: 'Jawaban singkat.', reasoning: 'Rencana token dibahas di sini.' },
      { role: 'user', content: 'oke terima kasih' },
    ];
    renderList({ messages: msgs });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'rencana' } });
    expect(screen.getByText('1 dari 1 pesan')).toBeInTheDocument();
    const rows = [...screen.getByLabelText('Chat messages').querySelectorAll('[data-msg-index]')];
    const active = rows
      .filter((r) => r.getAttribute('data-active') === 'true')
      .map((r) => Number(r.getAttribute('data-msg-index')));
    expect(active).toEqual([0]);
  });

  it('shows a match-count chip on every matching bubble (both roles)', () => {
    const { container } = renderList({ messages: msgset() });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    const chips = container.querySelectorAll('[data-testid="match-count"]');
    expect(chips.length).toBe(3);
    chips.forEach((c) => expect(c.textContent).toContain('1 hasil'));
  });

  it('counts multiple matches within a single message', () => {
    const { container } = renderList({
      messages: [{ role: 'assistant', content: 'Token A dan token B keduanya token.' }],
    });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    const chip = container.querySelector('[data-testid="match-count"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('3 hasil');
  });

  it('hides match-count chips unless the toolbar is open with a query', () => {
    const { container } = renderList({ messages: msgset() });
    // toolbar closed -> no chips
    expect(container.querySelectorAll('[data-testid="match-count"]').length).toBe(0);
    openSearch();
    // toolbar open but query empty -> still no chips
    expect(container.querySelectorAll('[data-testid="match-count"]').length).toBe(0);
  });

  it('resets search state when the conversation key changes', async () => {
    const { rerender } = renderList({ messages: msgset(), conversationKey: 'conv-A' });
    openSearch();
    fireEvent.change(screen.getByLabelText('Cari pesan'), { target: { value: 'token' } });
    expect(screen.getByRole('search')).toBeInTheDocument();
    rerender(
      <MessageList
        messages={msgset()}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={createRef<HTMLDivElement>()}
        conversationKey="conv-B"
      />,
    );
    await waitFor(() => expect(screen.queryByRole('search')).not.toBeInTheDocument());
  });
});
describe('MessageList per-message model attribution', () => {
  it('shows the model that produced an assistant reply in its footer', () => {
    renderList({
      model: 'hermes',
      messages: [{ role: 'assistant', content: 'halo', model: 'other' }],
    });
    expect(screen.getByLabelText('Model: Other Model')).toBeInTheDocument();
  });

  it('falls back to the raw id when the producing model is not in the catalog', () => {
    renderList({
      messages: [{ role: 'assistant', content: 'halo', model: 'unknown-xyz' }],
    });
    expect(screen.getByLabelText('Model: unknown-xyz')).toBeInTheDocument();
  });

  it('omits the attribution on user turns and replies without a model', () => {
    renderList({
      messages: [
        { role: 'user', content: 'hai', model: 'other' },
        { role: 'assistant', content: 'halo' },
      ],
    });
    expect(screen.queryByLabelText(/^Model:/)).not.toBeInTheDocument();
  });
});


describe('MessageList searchSignal', () => {
  it('opens the search toolbar when searchSignal changes to a nonzero value', () => {
    renderList({ searchSignal: 1 });
    // The toolbar input has aria-label "Cari pesan".
    expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
  });

  it('does not open the toolbar for a zero signal', () => {
    renderList({ searchSignal: 0 });
    expect(screen.queryByLabelText('Cari pesan')).not.toBeInTheDocument();
  });

  it('reopens when the signal increments again after being closed', () => {
    const { rerender } = render(
      <MessageList
        messages={[]}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={createRef<HTMLDivElement>()}
        conversationKey="k"
        searchSignal={1}
      />
    );
    expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
    // Close it via the close button, then increment the signal.
    fireEvent.click(screen.getByLabelText('Tutup pencarian'));
    expect(screen.queryByLabelText('Cari pesan')).not.toBeInTheDocument();
    rerender(
      <MessageList
        messages={[]}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={createRef<HTMLDivElement>()}
        conversationKey="k"
        searchSignal={2}
      />
    );
    expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
  });

  it('renders a delete button on stored messages when wired', () => {
    const onDeleteMessage = vi.fn().mockResolvedValue(true);
    renderList({
      messages: [{ id: 'm0', role: 'user', content: 'halo' }],
      onDeleteMessage,
    });

    expect(screen.getByLabelText('Hapus pesan')).toBeInTheDocument();
  });

  it('hides the delete button when no handler or no server id', () => {
    renderList({ messages: [{ role: 'user', content: 'halo' }] });
    expect(screen.queryByLabelText('Hapus pesan')).not.toBeInTheDocument();

    const { unmount } = renderList({
      messages: [{ id: 'm0', role: 'user', content: 'halo' }],
    });
    expect(screen.queryByLabelText('Hapus pesan')).not.toBeInTheDocument();
    unmount();
  });

  it('requires a confirming click before calling onDeleteMessage', async () => {
    const onDeleteMessage = vi.fn().mockResolvedValue(true);
    const { unmount } = renderList({
      messages: [{ id: 'm0', role: 'user', content: 'halo' }],
      onDeleteMessage,
    });

    const button = screen.getByLabelText('Hapus pesan');
    fireEvent.click(button);
    // First click only arms the confirmation state.
    expect(onDeleteMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Yakin hapus?')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Yakin hapus?'));
    await waitFor(() => expect(onDeleteMessage).toHaveBeenCalledWith('m0'));
    unmount();
  });

  it('does not call onDeleteMessage without a confirm', () => {
    const onDeleteMessage = vi.fn().mockResolvedValue(true);
    renderList({
      messages: [{ id: 'm0', role: 'assistant', content: 'jawaban' }],
      onDeleteMessage,
      streaming: false,
    });

    fireEvent.click(screen.getByLabelText('Hapus pesan'));
    expect(onDeleteMessage).not.toHaveBeenCalled();
  });
});

describe('MessageList pressed-state feedback', () => {
  it('gives the cancel-edit button a pressed state', () => {
    renderList({ messages: [{ role: 'user', content: 'teks asli' }], onEditMessage: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit pesan' }));
    const batal = screen.getByRole('button', { name: 'Batal' });
    expect(batal).toHaveClass('active:bg-chill-elevated');
    expect(batal).toHaveClass('active:translate-y-[2px]');
    expect(batal).toHaveClass('transition');
  });

  it('gives the jump-to-bottom button a pressed state', () => {
    const msgs = (): Message[] => [
      { role: 'user', content: 'Apa itu?' },
      { role: 'assistant', content: 'Jawaban panjang'.repeat(40) },
    ];
    const { scrollRef } = renderList({ messages: msgs() });
    const el = scrollRef.current!;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 });
    fireEvent.scroll(el);
    const btn = screen.getByRole('button', { name: 'Lompat ke bawah' });
    expect(btn).toHaveClass('active:bg-chill-accent-active');
    expect(btn).toHaveClass('active:translate-y-[2px]');
    expect(btn).toHaveClass('active:shadow-none');
  });

  it('gives the search toggle a pressed state', () => {
    renderList({
      messages: [
        { role: 'user', content: 'bagaimana cara hemat token?' },
        { role: 'assistant', content: 'Token hemat dengan ringkas.' },
      ],
    });
    const search = screen.getByRole('button', { name: 'Cari di percakapan' });
    expect(search).toHaveClass('active:bg-chill-elevated');
    expect(search).toHaveClass('transition');
  });
});

describe('MessageList reasoning copy action', () => {
  it('copies the reasoning text when the disclosure is expanded', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeText;
    renderList({
      messages: [
        { role: 'user', content: 'q', createdAt: 1 },
        { role: 'assistant', content: 'answer', reasoning: 'thinking step one', createdAt: 2 },
      ],
    });
    // The copy affordance lives inside the expanded disclosure, not before it.
    expect(screen.queryByRole('button', { name: 'Salin cara berpikir' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Berpikir/ }));
    expect(screen.getByRole('button', { name: 'Salin cara berpikir' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salin cara berpikir' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('thinking step one');
  });

  it('shows a transient copied confirmation for reasoning', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    renderList({
      messages: [
        { role: 'user', content: 'q', createdAt: 1 },
        { role: 'assistant', content: 'answer', reasoning: 'thinking step one', createdAt: 2 },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /Berpikir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salin cara berpikir' }));
    expect(await screen.findByRole('button', { name: 'Cara berpikir tersalin' })).toBeInTheDocument();
  });

  it('never offers the reasoning copy action when the disclosure is collapsed', () => {
    renderList({
      messages: [
        { role: 'user', content: 'q', createdAt: 1 },
        { role: 'assistant', content: 'answer', reasoning: 'thinking step one', createdAt: 2 },
      ],
    });
    expect(screen.queryByRole('button', { name: 'Salin cara berpikir' })).not.toBeInTheDocument();
  });

  it('gives the reasoning copy button a 44px touch target on mobile', () => {
    renderList({
      messages: [
        { role: 'user', content: 'q', createdAt: 1 },
        { role: 'assistant', content: 'answer', reasoning: 'thinking step one', createdAt: 2 },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /Berpikir/ }));
    const btn = screen.getByRole('button', { name: 'Salin cara berpikir' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });
});

describe('MessageList day dividers', () => {
  const DAY1 = new Date('2026-01-15T03:00:00Z').getTime();
  const DAY2 = new Date('2026-01-16T03:00:00Z').getTime();

  it('renders one date divider per distinct day group', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'a', createdAt: DAY1 },
      { role: 'assistant', content: 'b', createdAt: DAY2 },
    ];
    renderList({ messages: msgs });
    expect(screen.getAllByTestId('date-divider')).toHaveLength(2);
  });

  it('does not repeat a divider for consecutive same-day messages', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'a', createdAt: DAY1 },
      { role: 'assistant', content: 'b', createdAt: DAY1 + 60_000 },
    ];
    renderList({ messages: msgs });
    expect(screen.getAllByTestId('date-divider')).toHaveLength(1);
  });

  it('omits dividers when messages carry no timestamps', () => {
    const msgs: Message[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    renderList({ messages: msgs });
    expect(screen.queryAllByTestId('date-divider')).toHaveLength(0);
  });

  it('labels today message messages "Hari ini"', () => {
    const msgs: Message[] = [{ role: 'user', content: 'a', createdAt: Date.now() }];
    renderList({ messages: msgs });
    expect(screen.getByText('Hari ini')).toBeInTheDocument();
  });
});

describe('MessageList bookmark navigation', () => {
  const msgset = (): Message[] => [
    { role: 'user', content: 'a', bookmarked: true },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c', bookmarked: true },
  ];

  const openNav = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Navigasi pesan ditandai' }));
  };

  it('is hidden when no message is bookmarked', () => {
    renderList({ messages: [{ role: 'user', content: 'a' }] });
    expect(screen.queryByRole('button', { name: 'Navigasi pesan ditandai' })).not.toBeInTheDocument();
  });

  it('shows the floating toggle when at least one message is bookmarked', () => {
    renderList({ messages: msgset() });
    const btn = screen.getByRole('button', { name: 'Navigasi pesan ditandai' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('opens the toolbar and reports the bookmark count', () => {
    renderList({ messages: msgset() });
    openNav();
    expect(screen.getByText('1 dari 2 pesan ditandai')).toBeInTheDocument();
    expect(screen.getByLabelText('Posisi navigasi tandai')).toBeInTheDocument();
  });

  it('steps through bookmarked rows and marks the active one', () => {
    renderList({ messages: msgset() });
    openNav();
    const activeIndex = () => {
      const rows = [...screen.getByLabelText('Chat messages').querySelectorAll('[data-msg-index]')];
      return rows.filter((r) => r.getAttribute('data-bm-active') === 'true')
        .map((r) => Number(r.getAttribute('data-msg-index')));
    };
    expect(activeIndex()).toEqual([0]);
    fireEvent.click(screen.getByRole('button', { name: 'Tandai berikutnya' }));
    expect(activeIndex()).toEqual([2]);
    expect(screen.getByText('2 dari 2 pesan ditandai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tandai sebelumnya' }));
    expect(activeIndex()).toEqual([0]);
    expect(screen.getByText('1 dari 2 pesan ditandai')).toBeInTheDocument();
  });

  it('closes the toolbar and clears the highlight', () => {
    renderList({ messages: msgset() });
    openNav();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup navigasi tandai' }));
    expect(screen.queryByLabelText('Posisi navigasi tandai')).not.toBeInTheDocument();
    const rows = [...screen.getByLabelText('Chat messages').querySelectorAll('[data-msg-index]')];
    expect(rows.every((r) => r.getAttribute('data-bm-active') !== 'true')).toBe(true);
  });

  it('auto-closes when every bookmark is cleared while the toolbar is open', () => {
    renderList({ messages: [{ role: 'user', content: 'a', bookmarked: true }] });
    openNav();
    expect(screen.getByLabelText('Posisi navigasi tandai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ditandai' }));
    expect(screen.queryByLabelText('Posisi navigasi tandai')).not.toBeInTheDocument();
  });

  it('resets when the conversation key changes', () => {
    const view = renderList({ messages: msgset(), conversationKey: 'conv-A' });
    openNav();
    expect(screen.getByLabelText('Posisi navigasi tandai')).toBeInTheDocument();
    view.rerender(
      <MessageList
        messages={msgset()}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={createRef<HTMLDivElement>()}
        conversationKey="conv-B"
      />,
    );
    expect(screen.queryByLabelText('Posisi navigasi tandai')).not.toBeInTheDocument();
  });

  it('closes bookmark navigation when the search toolbar is opened via the shortcut', async () => {
    const view = renderList({ messages: msgset(), conversationKey: 'k' });
    openNav();
    expect(screen.getByLabelText('Posisi navigasi tandai')).toBeInTheDocument();
    view.rerender(
      <MessageList
        messages={msgset()}
        streaming={false}
        models={MODELS}
        model="hermes"
        useAgent
        scrollRef={createRef<HTMLDivElement>()}
        conversationKey="k"
        searchSignal={1}
      />,
    );
    await waitFor(() => expect(screen.queryByLabelText('Posisi navigasi tandai')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
  });
});

describe('MessageList quote action (Kutip pesan)', () => {
  it('calls onQuote with the message content on assistant turns', () => {
    const onQuote = vi.fn();
    renderList({
      messages: [{ id: 'a1', role: 'assistant', content: 'Halo dunia' }],
      onQuote,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kutip pesan' }));
    expect(onQuote).toHaveBeenCalledTimes(1);
    expect(onQuote).toHaveBeenCalledWith('Halo dunia');
  });

  it('renders the quote button on user turns too', () => {
    renderList({
      messages: [{ id: 'u1', role: 'user', content: 'Pertanyaan saya' }],
      onQuote: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Kutip pesan' })).toBeInTheDocument();
  });

  it('hides quote buttons when no handler is provided', () => {
    renderList({
      messages: [{ id: 'a1', role: 'assistant', content: 'Halo' }],
    });
    expect(screen.queryByRole('button', { name: 'Kutip pesan' })).not.toBeInTheDocument();
  });
});
