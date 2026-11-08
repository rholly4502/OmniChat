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

  it('adds the live streaming estimate to the token/cost readout', () => {
    // base 4000+1000 = 5k; estimate adds 500 -> 5.5k ~ $0.0299
    renderHeader({ streamingEstimate: 500 });
    expect(screen.getByText(/5\.5k token/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.03/)).toBeInTheDocument();
  });

  it('ignores a zero streaming estimate', () => {
    renderHeader({ streamingEstimate: 0 });
    expect(screen.getByText(/5k token/)).toBeInTheDocument();
  });

  it('renders a copy-transcript button and fires onCopyTranscript when given', () => {
    const onCopyTranscript = vi.fn();
    renderHeader({ onCopyTranscript });
    const btn = screen.getByRole('button', { name: 'Salin percakapan' });
    fireEvent.click(btn);
    expect(onCopyTranscript).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Percakapan tersalin' })).toBeInTheDocument();
  });

  it('omits the copy button when no handler is given', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Salin percakapan' })).not.toBeInTheDocument();
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

  it('falls back to a static label when the active model is not in the catalog', () => {
    const onChange = vi.fn();
    // The active model 'gpt-4o' is not in `catalog` (only claude-sonnet + gpt-4o
    // are), so the switcher must not render a select whose value matches no option.
    renderHeader({ model: 'some-removed-model', modelLabel: 'Model dihapus', models: catalog, onModelChange: onChange });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByText('Model dihapus')).toBeInTheDocument();
  });
});

describe('ChatHeader export menu', () => {
  it('renders an export button only when an onExport handler is given', () => {
    renderHeader({ onExport: vi.fn() });
    expect(screen.getByRole('button', { name: 'Ekspor percakapan' })).toBeInTheDocument();
  });

  it('omits the export button when no handler is given', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Ekspor percakapan' })).not.toBeInTheDocument();
  });

  it('lists every export format when the menu is opened', () => {
    renderHeader({ onExport: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor percakapan' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    for (const label of ['Markdown', 'JSON', 'CSV', 'PDF']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('calls onExport with the chosen format and closes the menu', () => {
    const onExport = vi.fn();
    renderHeader({ onExport });
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor percakapan' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith('csv');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    renderHeader({ onExport: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor percakapan' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('conversation title', () => {
  it('renders the active conversation title as a truncated readable label', () => {
    renderHeader({ title: 'Cicilan VGA 2026' });
    const label = screen.getByLabelText('Percakapan: Cicilan VGA 2026');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('Cicilan VGA 2026');
    expect(label.className).toContain('truncate');
  });

  it('omits the title label when no title is provided', () => {
    renderHeader();
    expect(screen.queryByLabelText(/Percakapan:/)).not.toBeInTheDocument();
  });
});
