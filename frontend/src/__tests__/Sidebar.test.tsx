import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';
import type { ModelOption } from '../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  it('renders a search box and forwards its value when a search is configured', () => {
    const onSearchChange = vi.fn();
    renderSidebar({ onSearchChange, search: '', sessions: [] });

    const input = screen.getByRole('searchbox', { name: /cari percakapan/i });
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'spotify' } });
    expect(onSearchChange).toHaveBeenCalledWith('spotify');
  });

  it('does not render a search box when search is not wired up', () => {
    renderSidebar({ sessions: [] });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows an empty-state message when a search has no matches', () => {
    renderSidebar({ onSearchChange: vi.fn(), search: 'tidakada', sessions: [] });
    expect(screen.getByText(/Tidak ada hasil/)).toBeInTheDocument();
  });

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
    const checkbox = screen.getByRole('checkbox', { name: 'Mode Agen' });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(props.onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('renders Direct mode when the bridge is off', () => {
    renderSidebar({ useAgent: false });
    expect(screen.getByText('Direct Mode')).toBeInTheDocument();
    expect(screen.getByText(/Langsung ke LLM/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mode Agen' })).not.toBeChecked();
  });

  it('renders a Mode Malam toggle when wired and forwards state', () => {
    const onNightModeChange = vi.fn();
    renderSidebar({ nightMode: false, onNightModeChange });
    const cb = screen.getByRole('checkbox', { name: 'Mode malam' });
    expect(cb).not.toBeChecked();
    fireEvent.click(cb);
    expect(onNightModeChange).toHaveBeenCalledWith(true);
  });

  it('does not render the Mode Malam toggle when unwired', () => {
    renderSidebar();
    expect(screen.queryByRole('checkbox', { name: 'Mode malam' })).not.toBeInTheDocument();
  });

  it('reflects an active night palette as checked', () => {
    renderSidebar({ nightMode: true, onNightModeChange: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Mode malam' })).toBeChecked();
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
    // The bin only arms the row; deletion needs an explicit second tap.
    expect(onDeleteSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Konfirmasi hapus Session 1'));
    expect(onDeleteSession).toHaveBeenCalledWith('s1');
  });

  it('renders a latest-message preview under a session when provided', () => {
    const sessions = [
      { id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1, preview: 'Ini pratinjau pesan' },
      { id: 's2', title: 'Session 2', messages: [], createdAt: 2, updatedAt: 2 },
    ];

    const { container } = renderSidebar({ sessions });

    const preview = screen.getByText('Ini pratinjau pesan');
    expect(preview).toBeInTheDocument();
    expect(preview.className).toContain('truncate');
    expect(preview.className).toContain('text-xs');
    expect(preview.className).toContain('text-chill-muted');
    expect(preview).toHaveAttribute('title', 'Ini pratinjau pesan');

    // Exactly one preview line: the session without a preview renders none, and the
    // session title/token row is separate.
    const previewLines = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.className.includes('truncate') && el.className.includes('text-xs'),
    );
    expect(previewLines).toHaveLength(1);
  });

  it('asks before deleting a session, because the bin sits next to the label', () => {
    const onDeleteSession = vi.fn();
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onDeleteSession,
    });

    fireEvent.click(screen.getByLabelText('Hapus Session 1'));

    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.getByText('Hapus sesi ini?')).toBeInTheDocument();
    const cancel = screen.getByLabelText('Batal hapus Session 1');
    expect(cancel).toHaveFocus(); // the safe choice owns the initial focus
    expect(cancel.className).toContain('min-h-[44px]');
    expect(cancel.className).toContain('min-w-[52px]');
    expect(screen.getByLabelText('Konfirmasi hapus Session 1').className).toContain('min-h-[44px]');
  });

  it('leaves the session alone when the confirmation is cancelled', () => {
    const onDeleteSession = vi.fn();
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onDeleteSession,
    });

    fireEvent.click(screen.getByLabelText('Hapus Session 1'));
    fireEvent.click(screen.getByLabelText('Batal hapus Session 1'));

    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Hapus sesi ini?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hapus Session 1')).toBeInTheDocument();
  });

  it('sizes the destructive confirmation at 14px, not 12px', () => {
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onDeleteSession: vi.fn(),
    });

    fireEvent.click(screen.getByLabelText('Hapus Session 1'));

    // Same ruling as the Clear-chat fix in d7f115d: a destructive, no-undo action
    // is not the place for the smallest text on screen. The confirm row was added
    // later and inherited the row's text-xs, so the fix had never reached it.
    const confirm = screen.getByLabelText('Konfirmasi hapus Session 1');
    const cancel = screen.getByLabelText('Batal hapus Session 1');
    expect(confirm.className).toContain('text-sm');
    expect(confirm.className).not.toContain('text-xs');
    expect(cancel.className).toContain('text-sm');
    expect(cancel.className).not.toContain('text-xs');
  });

  it('renders the session title at 14px, matching the rest of the sidebar', () => {
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
    });

    // The title is what a user scans to choose a conversation, so it carries the
    // same weight as the mode descriptions rather than the 12px label floor.
    const row = screen.getByText('Session 1').closest('button');
    expect(row!.parentElement!.className).toContain('text-sm');
    expect(row!.parentElement!.className).not.toContain('text-xs');
  });

  it('disarms the confirmation on Escape', () => {
    const onDeleteSession = vi.fn();
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onDeleteSession,
    });

    fireEvent.click(screen.getByLabelText('Hapus Session 1'));
    fireEvent.keyDown(screen.getByLabelText('Batal hapus Session 1'), { key: 'Escape' });

    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Hapus sesi ini?')).not.toBeInTheDocument();
  });

  it('shows an estimated cost on a session row when the model and usage are known', () => {
    renderSidebar({
      sessions: [{
        id: 's1', title: 'Deploy', messages: [],
        createdAt: 1, updatedAt: 1,
        model: 'claude-sonnet',
        promptTokens: 4000, completionTokens: 1000, totalTokens: 5000,
      }],
      activeSessionId: 's1',
    });

    // claude-sonnet: 4 * 0.003 + 1 * 0.015 = 0.027 -> $0.03
    expect(screen.getByLabelText('5k token, perkiraan biaya $0.03')).toBeInTheDocument();
    expect(screen.getByText(/5k/)).toBeInTheDocument();
    expect(screen.getByText(/≈\$0\.03/)).toBeInTheDocument();
  });

  it('omits the cost from a session row when no model is recorded', () => {
    renderSidebar({
      sessions: [{
        id: 's1', title: 'Deploy', messages: [],
        createdAt: 1, updatedAt: 1,
        promptTokens: 1000, completionTokens: 1000, totalTokens: 2000,
      }],
      activeSessionId: 's1',
    });

    // No model → no rate → show only the token count, never a bare cost.
    expect(screen.getByLabelText('2k token')).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it('keeps every sidebar label at or above the 12px legibility floor', () => {
    const { container } = renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onDeleteSession: vi.fn(),
    });
    // 10px/11px utility classes are below the floor this project settled on for
    // body-adjacent text (the Clear-chat fix in d7f115d established 12px).
    const sub12 = [...container.querySelectorAll('[class*="text-["]')]
      .map((el) => el.className)
      .filter((cls) => /text-\[(9|10|11)px\]/.test(String(cls)));
    expect(sub12).toEqual([]);
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

  it('gives the Parameter & Persona disclosure a real 44px tap target at 14px', () => {
    renderSidebar({
      settings: { systemPrompt: '', temperature: 0.7, maxTokens: 2048 },
    });

    // The <summary> is the only control that expands the advanced panel. It was
    // left at the 12px label floor with no minimum height while every sibling
    // control got its 44px box, so it was both the smallest and the hardest
    // thing to hit in the sidebar.
    const summary = screen.getByText(/Parameter & Persona/).closest('summary');
    expect(summary).not.toBeNull();
    expect(summary!.className).toContain('min-h-[44px]');
    expect(summary!.className).toContain('text-sm');
    expect(summary!.className).not.toContain('text-xs');
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

  it('does not size the range sliders with h-1.5, which made the tap target 6px', () => {
    renderSidebar({
      settings: { systemPrompt: '', temperature: 0.7, maxTokens: 2048 },
    });

    for (const name of ['Temperature', 'Max Tokens']) {
      const slider = screen.getByLabelText(name);
      expect(slider.className).not.toContain('h-1.5');
      expect(slider.className).toContain('w-full');
    }
  });

  it('pins a 44px slider hit area in index.css', () => {
    // jsdom performs no layout, so the box cannot be measured here. The rule
    // that creates the target lives in the stylesheet, so assert on it directly
    // -- otherwise a future `height: 6px` would silently shrink it again.
    // Read from disk: vitest stubs CSS imports (both `import` and `?raw`),
    // so the stylesheet text is only reachable through the filesystem.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/input\[type='range'\]\s*\{[^}]*height:\s*44px/);
    expect(css).toContain('::-webkit-slider-runnable-track');
    expect(css).toContain('::-moz-range-thumb');
  });

  it('applies the chill-vibe pixel-art treatment', () => {
    renderSidebar({
      sessions: [{ id: 's1', title: 'Session 1', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 's1',
      onNewSession: vi.fn(),
      settings: { systemPrompt: '', temperature: 0.7, maxTokens: 2048 },
    });

    const aside = document.querySelector('aside')!;
    expect(aside.className).toContain('bg-chill-bg');
    expect(aside.className).toContain('border-chill-border');

    // Brand uses the sand-gold accent and monospace pixel heading.
    const h1 = screen.getByRole('heading', { name: 'OmniChat' });
    expect(h1.className).toContain('text-chill-accent');
    expect(h1.className).toContain('pixel-heading');

    // Primary action flips to the warm accent with a hard pixel shadow.
    const newBtn = screen.getByText('Chat Baru');
    expect(newBtn.className).toContain('bg-chill-accent');
    expect(newBtn.className).toContain('text-chill-on-accent');
    expect(newBtn.className).toContain('pixel-shadow');
    expect(newBtn.className).toContain('rounded-none');

    // Editable controls sit on the chill surface with chunky borders.
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('bg-chill-surface');
    expect(select.className).toContain('border-chill-border');
    const apiInput = screen.getByPlaceholderText('(kosong = tanpa auth)');
    expect(apiInput.className).toContain('bg-chill-surface');
    expect(apiInput.className).toContain('border-chill-border');

    // Destructive actions use the warm terracotta.
    const clear = screen.getByText(/Clear chat/);
    expect(clear.className).toContain('text-chill-muted');
    expect(clear.className).toContain('hover:text-chill-red');
  });

  it('replaces the native disclosure triangle with a pixel chevron that flips on open', () => {
    renderSidebar({
      settings: { systemPrompt: '', temperature: 0.7, maxTokens: 2048 },
    });

    const details = screen.getByText(/Parameter & Persona/).closest('details')!;
    const summary = screen.getByText(/Parameter & Persona/).closest('summary')!;

    // The browser-default disclosure marker is suppressed; the state is carried
    // by the pixel chevron instead of the native triangle.
    expect(summary.className).toContain('list-none');

    // The group/group-open wiring lets the chevron rotate on open without JS.
    expect(details.className).toContain('group');

    const chevron = Array.from(summary.querySelectorAll('svg[aria-hidden="true"]')).find(
      (s) => s.querySelector('polyline')
    );
    expect(chevron).not.toBeNull();
    expect(chevron!.getAttribute('class') ?? '').toContain('group-open:rotate-180');
  });

  it('shows a rename button on server conversations and renames through it', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(true);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onRenameSession,
    });

    // Pencil only appears for a server-backed conversation, not a local draft.
    fireEvent.click(screen.getByLabelText(`Ganti nama Deploy`));
    expect(onRenameSession).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Judul baru untuk Deploy') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Obrolan baru' } });
    fireEvent.submit(input.closest('form')!);

    expect(onRenameSession).toHaveBeenCalledWith(A, 'Obrolan baru');
  });

  it('keeps the rename editor open when the server rejects the new title', async () => {
    const onRenameSession = vi.fn().mockResolvedValue(false);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onRenameSession,
    });

    fireEvent.click(screen.getByLabelText('Ganti nama Deploy'));
    const input = screen.getByLabelText('Judul baru untuk Deploy');
    fireEvent.change(input, { target: { value: 'Obrolan baru' } });
    fireEvent.submit(input.closest('form')!);

    await vi.waitFor(() => expect(onRenameSession).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Judul baru untuk Deploy')).toBeInTheDocument();
  });

  it('dismisses the rename editor on Escape and keeps the old title', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onRenameSession: vi.fn(),
    });

    fireEvent.click(screen.getByLabelText('Ganti nama Deploy'));
    const input = screen.getByLabelText('Judul baru untuk Deploy');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByLabelText('Judul baru untuk Deploy')).not.toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('hides the rename button for a local draft', () => {
    renderSidebar({
      sessions: [{ id: 'draft_1', title: 'Obrolan Baru', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 'draft_1',
      onRenameSession: vi.fn(),
    });

    expect(screen.queryByLabelText('Ganti nama Obrolan Baru')).not.toBeInTheDocument();
  });

  it('gives the rename-save button a focus-visible ring and a pixel press surface', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onRenameSession: vi.fn(),
    });

    fireEvent.click(screen.getByLabelText('Ganti nama Deploy'));
    const save = screen.getByLabelText('Simpan nama Deploy');
    expect(save.className).toContain('focus-visible:ring-2');
    expect(save.className).toContain('focus-visible:ring-chill-accent/60');
    expect(save.className).toContain('active:translate-y-[2px]');
    expect(save.className).toContain('active:shadow-none');
    expect(save.className).toContain('pixel-shadow-sm');
  });

  it('gives the view-switcher tabs a hard-edged hover/press surface', () => {
    renderSidebar();
    // Chat is the active tab (selected-state branch); Pengeluaran is inactive, so
    // it is the one that must expose the un-selected hover/press surface.
    const expensesTab = screen.getByRole('tab', { name: 'Pengeluaran' });
    expect(expensesTab.className).toContain('hover:bg-chill-surface');
    expect(expensesTab.className).toContain('active:bg-chill-surface');
    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    expect(chatTab.className).toContain('pixel-shadow-sm');
    // Active tab wears the theme's 2px accent left-bar; the inactive tab keeps
    // an invisible 2px border so nothing shifts when the selection changes.
    expect(chatTab.className).toContain('border-l-2');
    expect(chatTab.className).toContain('border-chill-accent');
    expect(expensesTab.className).toContain('border-transparent');
  });

  it('shows a pin button on server conversations and toggles through it', () => {
    const onPinSession = vi.fn().mockResolvedValue(true);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onPinSession,
    });

    const pin = screen.getByLabelText('Sematkan Deploy');
    fireEvent.click(pin);
    expect(onPinSession).toHaveBeenCalledWith(A, true);
  });

  it('reflects the pinned state and offers unpin for an already-pinned row', () => {
    const onPinSession = vi.fn().mockResolvedValue(true);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1, isPinned: true }],
      activeSessionId: A,
      onPinSession,
    });

    const pin = screen.getByLabelText('Lepas sematan Deploy');
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pin);
    expect(onPinSession).toHaveBeenCalledWith(A, false);
  });

  it('hides the pin button for a local draft', () => {
    renderSidebar({
      sessions: [{ id: 'draft_1', title: 'Obrolan Baru', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 'draft_1',
      onPinSession: vi.fn(),
    });

    expect(screen.queryByLabelText('Sematkan Obrolan Baru')).not.toBeInTheDocument();
  });

  it('gives the pin button a focus-visible ring and a 44px hit area', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onPinSession: vi.fn(),
    });

    const pin = screen.getByLabelText('Sematkan Deploy');
    expect(pin.className).toContain('min-h-[44px]');
    expect(pin.className).toContain('min-w-[44px]');
    expect(pin.className).toContain('focus-visible:ring-2');
    expect(pin.className).toContain('focus-visible:ring-chill-accent/60');
  });

  it('shows an archive button on server conversations and toggles through it', () => {
    const onArchiveSession = vi.fn().mockResolvedValue(true);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1 }],
      activeSessionId: A,
      onArchiveSession,
    });

    const arch = screen.getByLabelText('Arsipkan Deploy');
    expect(arch).toBeInTheDocument();
    fireEvent.click(arch);
    expect(onArchiveSession).toHaveBeenCalledWith(A, true);
  });

  it('reflects the archived state and offers unarchive for an already-archived row', () => {
    const onArchiveSession = vi.fn().mockResolvedValue(true);
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1, isArchived: true }],
      activeSessionId: A,
      showArchived: true,
      onArchiveSession,
    });

    const arch = screen.getByLabelText('Buka dari arsip Deploy');
    expect(arch).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(arch);
    expect(onArchiveSession).toHaveBeenCalledWith(A, false);
  });

  it('hides the archive button for a local draft', () => {
    renderSidebar({
      sessions: [{ id: 'draft_1', title: 'Obrolan Baru', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 'draft_1',
      onArchiveSession: vi.fn(),
    });

    expect(screen.queryByLabelText('Arsipkan Obrolan Baru')).not.toBeInTheDocument();
  });

  it('hides archived conversations by default and reveals them via the toggle', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    renderSidebar({
      sessions: [
        { id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1, isArchived: true },
        { id: B, title: 'Aktif', messages: ['y'], createdAt: 2, updatedAt: 2 },
      ],
      showArchived: false,
      onToggleShowArchived: vi.fn(),
    });

    // Archived row is hidden from the list by default.
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    // The toggle is present and labelled for the hidden state.
    expect(screen.getByRole('button', { name: 'Tampilkan arsip' })).toBeInTheDocument();
  });

  it('renders archived rows when the show-archived toggle is on', () => {
    const A = '11111111-1111-1111-1111-111111111111';
    renderSidebar({
      sessions: [{ id: A, title: 'Deploy', messages: ['x'], createdAt: 1, updatedAt: 1, isArchived: true }],
      showArchived: true,
      onToggleShowArchived: vi.fn(),
    });

    expect(screen.getByText('Deploy')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Sembunyikan arsip' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  describe('conversation export menu', () => {
    const session = {
      id: 's1',
      title: 'Deploy',
      messages: [{ role: 'user' as const, content: 'halo' }],
      createdAt: 1,
      updatedAt: 1,
    };

    it('opens a menu listing all four formats on click', () => {
      renderSidebar({ sessions: [session], onExportSession: vi.fn() });
      fireEvent.click(screen.getByLabelText('Ekspor Deploy'));

      expect(screen.getByRole('menu', { name: 'Format ekspor Deploy' })).toBeInTheDocument();
      for (const label of ['Markdown', 'JSON', 'CSV', 'PDF']) {
        expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
      }
    });

    it('calls onExportSession with the chosen format and closes the menu', () => {
      const onExportSession = vi.fn();
      renderSidebar({ sessions: [session], onExportSession });
      fireEvent.click(screen.getByLabelText('Ekspor Deploy'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'PDF' }));

      expect(onExportSession).toHaveBeenCalledWith(session, 'pdf');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('does not render the export control when the session has no messages', () => {
      renderSidebar({
        sessions: [{ id: 's1', title: 'Kosong', messages: [], createdAt: 1, updatedAt: 1 }],
        onExportSession: vi.fn(),
      });
      expect(screen.queryByLabelText('Ekspor Kosong')).not.toBeInTheDocument();
    });
  });
});

describe('Sidebar usage panel', () => {
  const USAGE = {
    totalPromptTokens: 1100,
    totalCompletionTokens: 500,
    totalTokens: 1600,
    conversationCount: 3,
    totalUpFeedback: 2,
    totalDownFeedback: 1,
    byModel: { hermes: { promptTokens: 1100, completionTokens: 500, totalTokens: 1600 } },
  };

  it('renders the aggregate token total and estimated cost', () => {
    renderSidebar({ sessions: [], usageSummary: USAGE });

    expect(screen.getByText('1.6k token')).toBeInTheDocument();
    expect(screen.getByText('3 percakapan')).toBeInTheDocument();
    expect(screen.getByLabelText('Perkiraan total biaya $0.0062')).toBeInTheDocument();
  });

  it('lists each model with its own token count and cost estimate', () => {
    renderSidebar({ sessions: [], usageSummary: USAGE });

    expect(screen.getByText('hermes')).toBeInTheDocument();
    expect(screen.getByText('1.6k · ≈$0.0062')).toBeInTheDocument();
  });

  it('omits the panel when there is no usage to report', () => {
    renderSidebar({ sessions: [], usageSummary: { totalTokens: 0, conversationCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalUpFeedback: 0, totalDownFeedback: 0, byModel: {} } });

    expect(screen.queryByText('Penggunaan')).not.toBeInTheDocument();
  });

  it('renders aggregate like/dislike feedback counts when present', () => {
    renderSidebar({ sessions: [], usageSummary: { ...USAGE, totalUpFeedback: 5, totalDownFeedback: 2 } });

    expect(screen.getByText('Umpan balik pesan')).toBeInTheDocument();
    expect(screen.getByTitle('Disukai')).toHaveTextContent('5');
    expect(screen.getByTitle('Tidak disukai')).toHaveTextContent('2');
  });

  it('omits the feedback row when no message is rated', () => {
    renderSidebar({ sessions: [], usageSummary: { ...USAGE, totalUpFeedback: 0, totalDownFeedback: 0 } });

    expect(screen.queryByText('Umpan balik pesan')).not.toBeInTheDocument();
  });
});

describe('Sidebar history model filter (cross-mode)', () => {
  it('offers every history model when historyModels is provided, even off-mode ones', () => {
    const agentModels = [{ id: 'hermes', label: 'Hermes (Default)' }];
    const directModels = [{ id: 'llama', label: 'Llama (Direct)' }];
    renderSidebar({
      models: agentModels,
      historyModels: [...agentModels, ...directModels],
      onSearchChange: vi.fn(),
      search: '',
      sessions: [],
    });
    // The model *selector* still only offers the active (agent) catalog.
    const selector = document.getElementById('model-select') as HTMLSelectElement;
    expect(selector.textContent).not.toContain('Llama (Direct)');
    // But the history filter dropdown offers both modes.
    const filter = screen.getByLabelText('Filter model');
    expect(filter.textContent).toContain('Llama (Direct)');
    expect(filter.textContent).toContain('Hermes (Default)');
  });
});

describe('Sidebar history mode filter', () => {
  it('forwards a mode filter change', () => {
    const onModeFilterChange = vi.fn();
    renderSidebar({
      onSearchChange: vi.fn(),
      search: '',
      sessions: [],
      modeFilter: 'direct',
      onModeFilterChange,
    });
    const select = screen.getByLabelText('Filter mode') as HTMLSelectElement;
    expect(select.value).toBe('direct');
    fireEvent.change(select, { target: { value: 'agent' } });
    expect(onModeFilterChange).toHaveBeenCalledWith('agent');
  });
});

describe('Sidebar reset parameter', () => {
  it('renders a Reset parameter button when wired and forwards it', () => {
    const onResetPersona = vi.fn();
    renderSidebar({
      settings: { systemPrompt: 'x', temperature: 0.5, maxTokens: 1024 },
      onResetPersona,
    });
    const btn = screen.getByRole('button', { name: 'Reset parameter' });
    fireEvent.click(btn);
    expect(onResetPersona).toHaveBeenCalledTimes(1);
  });

  it('does not render Reset parameter when unwired', () => {
    renderSidebar({ settings: { systemPrompt: '', temperature: 0.7, maxTokens: 2048 } });
    expect(screen.queryByRole('button', { name: 'Reset parameter' })).not.toBeInTheDocument();
  });
});

describe('Sidebar focus mode toggle', () => {
  it('renders a Mode Fokus toggle when wired and forwards state', () => {
    const onFocusModeChange = vi.fn();
    renderSidebar({ focusMode: false, onFocusModeChange });
    const cb = screen.getByRole('checkbox', { name: 'Mode fokus' });
    expect(cb).not.toBeChecked();
    fireEvent.click(cb);
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
  });

  it('does not render the Mode Fokus toggle when unwired', () => {
    renderSidebar({});
    expect(screen.queryByRole('checkbox', { name: 'Mode fokus' })).not.toBeInTheDocument();
  });

  it('reflects an enabled focus mode', () => {
    renderSidebar({ focusMode: true, onFocusModeChange: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Mode fokus' })).toBeChecked();
  });
});

describe('Sidebar chill mode toggle', () => {
  it('renders a Chill Mode toggle when wired and forwards state', () => {
    const onChillModeChange = vi.fn();
    renderSidebar({ chillMode: false, onChillModeChange });
    const cb = screen.getByRole('checkbox', { name: 'Chill Mode' });
    expect(cb).not.toBeChecked();
    fireEvent.click(cb);
    expect(onChillModeChange).toHaveBeenCalledWith(true);
  });

  it('does not render the Chill Mode toggle when unwired', () => {
    renderSidebar({});
    expect(screen.queryByRole('checkbox', { name: 'Chill Mode' })).not.toBeInTheDocument();
  });

  it('reflects an enabled chill mode', () => {
    renderSidebar({ chillMode: true, onChillModeChange: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Chill Mode' })).toBeChecked();
  });
});

describe('Sidebar audit entry (mobile-accessible)', () => {
  it('renders an Audit button when wired and forwards the click', () => {
    const onOpenAudit = vi.fn();
    renderSidebar({ onOpenAudit });
    const btn = screen.getByRole('button', { name: /Audit percakapan/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenAudit).toHaveBeenCalledTimes(1);
  });

  it('does not render the Audit button when unwired', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: /Audit percakapan/i })).not.toBeInTheDocument();
  });

  it('keeps the Audit button at the 44px touch floor with a focus ring and pixel surface', () => {
    renderSidebar({ onOpenAudit: vi.fn() });
    const btn = screen.getByRole('button', { name: /Audit percakapan/i });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('focus-visible:ring-2');
    expect(btn.className).toContain('focus-visible:ring-chill-accent/60');
    expect(btn.className).toContain('pixel-shadow-sm');
    expect(btn.className).toContain('rounded-none');
    expect(btn.className).toContain('bg-chill-surface');
  });
});

describe('Sidebar load-more pagination', () => {
  it('renders a load-more button when hasMore is true and forwards the callback', () => {
    const onLoadMore = vi.fn();
    const sessions = [
      { id: '11111111-1111-1111-1111-111111111111', title: 'Sesi 1', mode: 'agent', model: 'hermes', createdAt: 1, updatedAt: 2, messages: [], isPinned: false },
    ];
    renderSidebar({ hasMore: true, onLoadMore, sessions });

    const btn = screen.getByRole('button', { name: /Muat lebih banyak/i });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('rounded-none');

    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides the load-more button when hasMore is false', () => {
    const onLoadMore = vi.fn();
    const sessions = [
      { id: '11111111-1111-1111-1111-111111111111', title: 'Sesi 1', mode: 'agent', model: 'hermes', createdAt: 1, updatedAt: 2, messages: [], isPinned: false },
    ];
    renderSidebar({ hasMore: false, onLoadMore, sessions });

    expect(screen.queryByRole('button', { name: /Muat lebih banyak/i })).toBeNull();
  });

  it('does not render a load-more button when no handler is provided', () => {
    const sessions = [
      { id: '11111111-1111-1111-1111-111111111111', title: 'Sesi 1', mode: 'agent', model: 'hermes', createdAt: 1, updatedAt: 2, messages: [], isPinned: false },
    ];
    renderSidebar({ hasMore: true, sessions });

    expect(screen.queryByRole('button', { name: /Muat lebih banyak/i })).toBeNull();
  });
});

describe('Sidebar history date grouping', () => {
  const GUID_A = '11111111-1111-1111-1111-111111111111';
  const GUID_B = '22222222-2222-2222-2222-222222222222';
  const GUID_C = '33333333-3333-3333-3333-333333333333';
  const NOW = Date.now();
  const day = 24 * 60 * 60 * 1000;

  it('renders study headings above the session buckets', () => {
    const sessions = [
      { id: GUID_A, title: 'Lama', messages: [], createdAt: 0, updatedAt: NOW - 30 * day },
      { id: GUID_B, title: 'Baru', messages: [], createdAt: 0, updatedAt: NOW - 1000 },
      { id: 'draft_1', title: 'Obrolan Draft', messages: [], createdAt: NOW, updatedAt: NOW },
    ];
    renderSidebar({ sessions, activeSessionId: GUID_A });

    expect(screen.getByText('Hari Ini')).toBeInTheDocument();
    expect(screen.getByText('Sebelumnya')).toBeInTheDocument();
    expect(screen.getByText('Draf')).toBeInTheDocument();
    // The session rows themselves still render under their headings.
    expect(screen.getByText('Lama')).toBeInTheDocument();
    expect(screen.getByText('Baru')).toBeInTheDocument();
  });

  it('renders a Disematkan heading for pinned server conversations', () => {
    const sessions = [
      { id: GUID_C, title: 'Semat', messages: ['x'], createdAt: 0, updatedAt: NOW, isPinned: true },
      { id: GUID_A, title: 'Biasa', messages: [], createdAt: 0, updatedAt: NOW - 1000 },
    ];
    renderSidebar({ sessions });
    expect(screen.getByText('Disematkan')).toBeInTheDocument();
    expect(screen.getByText('Semat')).toBeInTheDocument();
    expect(screen.getByText('Biasa')).toBeInTheDocument();
  });
});
