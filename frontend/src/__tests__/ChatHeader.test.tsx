import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatHeader } from '../components/ChatHeader';
import type { TokenUsage } from '../types';

const usage: TokenUsage = { promptTokens: 4000, completionTokens: 1000 };

/**
 * Unit tests for the desktop chat header: the active-mode/model telemetry the
 * mobile top bar already provides, now present on md+ screens so the current
 * model stays visible while chatting with the sidebar collapsed.
 */
function renderHeader(overrides: Partial<Parameters<typeof ChatHeader>[0]> = {}) {
  const props = { useAgent: true, model: 'claude-sonnet', modelLabel: 'Claude Sonnet', usage, ...overrides };
  return render(<ChatHeader {...props} />);
}

describe('ChatHeader', () => {
  it('renders the mode badge with the active model label', () => {
    renderHeader();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
  });

  it('renders Direct mode label when useAgent is false', () => {
    renderHeader({ useAgent: false, modelLabel: 'GPT-4o' });
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('shows the cumulative token count and approximate cost', () => {
    renderHeader();
    // 4000 + 1000 = 5k tokens; claude-sonnet: 4*0.003 + 1*0.015 = $0.0270
    expect(screen.getByText(/5k token/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.03/)).toBeInTheDocument();
  });

  it('omits usage telemetry when there is no usage yet', () => {
    renderHeader({ usage: undefined, modelLabel: 'Claude Sonnet' });
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
  });
});

describe('ChatHeader focus-mode hook', () => {
  it('carries the chat-header-bar class so focus mode can hide it', () => {
    const { container } = renderHeader();
    expect(container.firstChild as HTMLElement).toHaveClass('chat-header-bar');
  });
});

describe('ChatHeader model switcher', () => {
  const catalog = [
    { id: 'claude-sonnet', label: 'Claude Sonnet' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ];

  it('renders a select with the catalog when a change handler is provided', () => {
    const onChange = () => {};
    renderHeader({ models: catalog, onModelChange: onChange });
    const select = screen.getByLabelText('Ganti model') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('claude-sonnet');
    expect(screen.getByRole('option', { name: 'GPT-4o' })).toBeInTheDocument();
  });

  it('calls onModelChange with the selected model id', () => {
    const onChange = vi.fn();
    renderHeader({ models: catalog, onModelChange: onChange });
    fireEvent.change(screen.getByLabelText('Ganti model'), { target: { value: 'gpt-4o' } });
    expect(onChange).toHaveBeenCalledWith('gpt-4o');
  });

  it('falls back to a static label when no change handler is given', () => {
    renderHeader({ models: catalog });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
  });
});
