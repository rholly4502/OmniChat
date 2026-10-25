import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';
import type { ModelOption } from '../types';

const MODELS: ModelOption[] = [
  { id: 'hermes', label: 'Hermes (Default)' },
  { id: 'other', label: 'Other Model' },
];

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const sidebarRef = createRef<HTMLElement>();
  const closeButtonRef = createRef<HTMLButtonElement>();
  const props = {
    sidebarRef,
    open: false,
    onClose: vi.fn(),
    closeButtonRef,
    useAgent: true,
    onToggleMode: vi.fn(),
    models: MODELS,
    model: 'hermes',
    onModelChange: vi.fn(),
    apiKey: '',
    onApiKeyChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  const view = render(<Sidebar {...props} />);
  return { ...view, props, sidebarRef, closeButtonRef };
}

describe('Sidebar', () => {
  it('carries the id and label the hamburger button points at', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside).toHaveAttribute('id', 'chat-sidebar');
    expect(aside).toHaveAttribute('aria-label', 'Chat settings');
  });

  it('is only a dialog while open, so the focus trap keys off the right state', () => {
    const { container, unmount } = renderSidebar({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('aside')).not.toHaveAttribute('role');
    unmount();

    renderSidebar({ open: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Chat settings');
  });

  it('slides in and out with the open prop', () => {
    const { container, unmount } = renderSidebar({ open: false });
    expect(container.querySelector('aside')?.className).toContain('-translate-x-full');
    unmount();

    const open = renderSidebar({ open: true });
    expect(open.container.querySelector('aside')?.className).toContain('translate-x-0');
  });

  it('stays scrollable and layer-promoted for short landscape viewports', () => {
    const { container } = renderSidebar();
    const cls = container.querySelector('aside')?.className ?? '';
    expect(cls).toContain('overflow-y-auto');
    expect(cls).toContain('overscroll-y-contain');
    expect(cls).toContain('will-change-transform');
  });

  it('shows the product branding', () => {
    renderSidebar();
    expect(screen.getByRole('heading', { name: 'OmniChat' })).toBeInTheDocument();
    expect(screen.getByText(/Hybrid AI Dashboard/)).toBeInTheDocument();
  });

  it('renders Agent mode and flips it through onToggleMode', () => {
    const { props } = renderSidebar({ useAgent: true });
    expect(screen.getByText('Agent Mode')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(props.onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('renders Direct mode when the bridge is off', () => {
    renderSidebar({ useAgent: false });
    expect(screen.getByText('Direct Mode')).toBeInTheDocument();
    expect(screen.getByText(/Langsung ke LLM/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('lists the catalog and reports a new selection', () => {
    const { props } = renderSidebar({ model: 'other' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('other');
    expect(screen.getByText('Hermes (Default)')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'hermes' } });
    expect(props.onModelChange).toHaveBeenCalledWith('hermes');
  });

  it('keeps the model select at 16px on mobile and 44px tall', () => {
    renderSidebar();
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('text-base md:text-sm');
    expect(select.className).toContain('min-h-[44px]');
  });

  it('hardens the API key input against mobile autocorrect', () => {
    const { props } = renderSidebar();
    const input = screen.getByPlaceholderText('(kosong = tanpa auth)');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input.className).toContain('text-base md:text-sm');
    fireEvent.change(input, { target: { value: 'k123' } });
    expect(props.onApiKeyChange).toHaveBeenCalledWith('k123');
  });

  it('shows the unlocked indicator and unauthenticated copy without a key', () => {
    renderSidebar({ apiKey: '' });
    expect(screen.getByTestId('unlock-icon')).toBeInTheDocument();
    expect(screen.getByText(/Tanpa auth/)).toBeInTheDocument();
  });

  it('shows the locked indicator and authenticated copy once a key is set', () => {
    renderSidebar({ apiKey: 'secret' });
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
    expect(screen.getByText(/X-Api-Key aktif/)).toBeInTheDocument();
  });

  it('clears the conversation through onClear', () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByText(/Clear chat/));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('closes through onClose and focuses the close button it was given', () => {
    const { props, closeButtonRef } = renderSidebar({ open: true });
    const closeBtn = screen.getByLabelText('Close sidebar');
    expect(closeButtonRef.current).toBe(closeBtn);
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('hands the aside element back through sidebarRef for the drawer hook', () => {
    const { container, sidebarRef } = renderSidebar();
    expect(sidebarRef.current).toBe(container.querySelector('aside'));
  });

  it('keeps the close button and Clear chat at least 44px', () => {
    renderSidebar();
    expect(screen.getByLabelText('Close sidebar').className).toContain('min-h-[44px]');
    expect(screen.getByText(/Clear chat/).className).toContain('min-h-[44px]');
  });

  it('renders New Chat button and session list when provided', () => {
    const onNewSession = vi.fn();
    const onSelectSession = vi.fn();
    const onDeleteSession = vi.fn();
    const mockSessions = [
      { id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 },
      { id: 's2', title: 'Session 2', messages: [], createdAt: 2, updatedAt: 2 },
    ];

    renderSidebar({
      sessions: mockSessions,
      activeSessionId: 's1',
      onNewSession,
      onSelectSession,
      onDeleteSession,
    });

    const newChatBtn = screen.getByText('Chat Baru');
    expect(newChatBtn).toBeInTheDocument();
    fireEvent.click(newChatBtn);
    expect(onNewSession).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Session 2'));
    expect(onSelectSession).toHaveBeenCalledWith('s2');

    const deleteBtn = screen.getByLabelText('Hapus Session 1');
    fireEvent.click(deleteBtn);
    expect(onDeleteSession).toHaveBeenCalledWith('s1');
  });

  it('session rows are 44px touch targets and keyboard-selectable', () => {
    const onSelectSession = vi.fn();
    const mockSessions = [
      { id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 },
    ];

    renderSidebar({
      sessions: mockSessions,
      activeSessionId: 's1',
      onSelectSession,
      onDeleteSession: vi.fn(),
    });

    // The row is selectable via a real button, so keyboard and screen-reader users
    // can switch sessions; a bare clickable div was unreachable for both.
    const selectBtn = screen.getByText('Session 1').closest('button');
    expect(selectBtn).not.toBeNull();
    expect(selectBtn!.className).toContain('min-h-[44px]');
    expect(screen.getByLabelText('Hapus Session 1').className).toContain('min-w-[44px]');
    expect(screen.getByLabelText('Hapus Session 1').className).toContain('min-h-[44px]');
  });

  it('marks the active session with aria-current', () => {
    renderSidebar({
      sessions: [
        { id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 },
        { id: 's2', title: 'Session 2', messages: [], createdAt: 2, updatedAt: 2 },
      ],
      activeSessionId: 's2',
      onSelectSession: vi.fn(),
    });

    expect(screen.getByText('Session 2').closest('button')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Session 1').closest('button')).not.toHaveAttribute('aria-current');
  });

  it('renders Parameter & Persona accordion when settings prop is passed', () => {
    const onSystemPromptChange = vi.fn();
    const onTemperatureChange = vi.fn();
    const onMaxTokensChange = vi.fn();

    renderSidebar({
      settings: {
        systemPrompt: 'Be concise',
        temperature: 0.7,
        maxTokens: 2048,
      },
      onSystemPromptChange,
      onTemperatureChange,
      onMaxTokensChange,
    });

    expect(screen.getByText(/Parameter & Persona/)).toBeInTheDocument();

    const promptInput = screen.getByPlaceholderText(/Bertindak sebagai Software Architect/);
    expect(promptInput).toHaveValue('Be concise');
    fireEvent.change(promptInput, { target: { value: 'Be brief' } });
    expect(onSystemPromptChange).toHaveBeenCalledWith('Be brief');

    const tempSlider = screen.getByLabelText('Temperature');
    fireEvent.change(tempSlider, { target: { value: '0.9' } });
    expect(onTemperatureChange).toHaveBeenCalledWith(0.9);

    const tokensSlider = screen.getByLabelText('Max Tokens');
    fireEvent.change(tokensSlider, { target: { value: '4096' } });
    expect(onMaxTokensChange).toHaveBeenCalledWith(4096);
  });
});
