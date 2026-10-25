import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Menunggu respons');
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
    expect(bubble?.className).toContain('rounded-bl-sm');
  });

  it('renders a copy message button on assistant turns', () => {
    renderList({ messages: [{ role: 'assistant', content: 'Halo dari asisten' }] });
    expect(screen.getByRole('button', { name: 'Salin pesan' })).toBeInTheDocument();
  });

  it('gives the copy button a 44px touch target on mobile', () => {
    // With px-2 py-0.5 around a 12px icon this measured 56x19 on a phone.
    renderList({ messages: [{ role: 'assistant', content: 'Halo dari asisten' }] });
    const btn = screen.getByRole('button', { name: 'Salin pesan' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });
});
