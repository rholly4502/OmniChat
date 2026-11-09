import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTopBar } from '../components/MobileTopBar';

/**
 * Unit tests for the extracted mobile top bar (frontend decomposition step 9).
 * The hamburger's aria wiring is load-bearing: `aria-controls` targets the
 * sidebar's `id`, and `aria-expanded` reports drawer state.
 */
function renderBar(overrides: Partial<Parameters<typeof MobileTopBar>[0]> = {}) {
  const props = {
    sidebarOpen: false,
    onOpenSidebar: vi.fn(),
    useAgent: true,
    menuButtonRef: createRef<HTMLButtonElement>(),
    ...overrides,
  };
  return { ...render(<MobileTopBar {...props} />), props };
}

describe('MobileTopBar', () => {
  it('renders the hamburger with its accessible name and sidebar wiring', () => {
    renderBar();
    const button = screen.getByLabelText('Open menu');
    expect(button).toHaveAttribute('aria-controls', 'chat-sidebar');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('reports the drawer as expanded when open', () => {
    renderBar({ sidebarOpen: true });
    expect(screen.getByLabelText('Open menu')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the drawer on click', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(props.onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('attaches the injected ref to the hamburger so focus can be restored', () => {
    const { props } = renderBar();
    expect(props.menuButtonRef.current).toBe(screen.getByLabelText('Open menu'));
  });

  it('labels the active mode and swaps the badge icon with it', () => {
    const agent = renderBar({ useAgent: true });
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('OmniChat')).toBeInTheDocument();
    // hamburger svg + mode badge icon + decorative easter-egg fish
    expect(agent.container.querySelectorAll('svg')).toHaveLength(3);
    agent.unmount();

    renderBar({ useAgent: false });
    expect(screen.getByText('Direct')).toBeInTheDocument();
  });

  it('is hidden from the md breakpoint up, where the sidebar is static', () => {
    const { container } = renderBar();
    expect((container.firstElementChild as HTMLElement).className).toContain('md:hidden');
  });

  it('guest variant shows a logout button and no hamburger', () => {
    const onLogout = vi.fn();
    renderBar({ isGuest: true, onLogout });
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('guest variant advertises direct mode and never the agent badge', () => {
    renderBar({ isGuest: true, useAgent: true });
    expect(screen.getByText(/Guest · Direct/)).toBeInTheDocument();
    expect(screen.getByText(/Guest · Direct/).className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
  });

  it('guest variant keeps the logout control at the 44px touch floor', () => {
    renderBar({ isGuest: true });
    const logout = screen.getByRole('button', { name: 'Keluar' });
    expect(logout.className).toContain('min-h-[44px]');
    expect(logout.className).toContain('min-w-[44px]');
    expect(logout.className).toContain('focus-visible:ring-2');
    expect(logout.className).toContain('text-sm');
  });

  it('applies the chill pixel-art treatment (warm palette, chunky edges, pixel brand)', () => {
    const { container } = renderBar();
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain('bg-chill-bg');
    expect(bar.className).toContain('border-chill-border');
    const brand = screen.getByText('OmniChat');
    expect(brand.className).toContain('pixel-heading');
    expect(brand.className).toContain('text-chill-accent');
    const burger = screen.getByLabelText('Open menu');
    expect(burger.className).toContain('rounded-none');
    expect(burger.className).toContain('focus-visible:ring-chill-accent/60');
  });
  it('hides a decorative deep-sea pixel fish beside the brand until hover (easter egg)', () => {
    const { container } = renderBar();
    const fish = Array.from(container.querySelectorAll('svg')).find(
      (s) => s.getAttribute('aria-hidden') === 'true' && s.className.baseVal?.includes('chill-deepsea'),
    );
    expect(fish).toBeDefined();
    expect(fish!.getAttribute('aria-hidden')).toBe('true');
    expect(fish!.getAttribute('class')).toContain('opacity-0');
    expect(fish!.getAttribute('class')).toContain('group-hover:opacity-100');
    expect(fish!.getAttribute('class')).toContain('group-focus-within:opacity-100');
    expect(fish!.hasAttribute('role')).toBe(false);
    expect(fish!.hasAttribute('tabindex')).toBe(false);
  });

  it('on the Pengeluaran view shows a pixel view chip and hides chat telemetry', () => {
    renderBar({ activeView: 'expenses' });
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
    const chip = screen.getByText('Pengeluaran');
    expect(chip.className).toContain('pixel-heading');
    expect(chip.className).toContain('bg-chill-elevated');
    expect(chip.className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
  });

  it('on the Lowongan view shows a pixel view chip and hides chat telemetry', () => {
    renderBar({ activeView: 'jobs' });
    expect(screen.getByText('Lowongan')).toBeInTheDocument();
    const chip = screen.getByText('Lowongan');
    expect(chip.className).toContain('pixel-heading');
    expect(chip.className).toContain('bg-chill-elevated');
    expect(chip.className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
  });

  it('on the Event view shows a pixel view chip and hides chat telemetry', () => {
    renderBar({ activeView: 'events' });
    expect(screen.getByText('Event')).toBeInTheDocument();
    const chip = screen.getByText('Event');
    expect(chip.className).toContain('pixel-heading');
    expect(chip.className).toContain('bg-chill-elevated');
    expect(chip.className).toContain('rounded-none');
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    expect(screen.queryByText('Lowongan')).not.toBeInTheDocument();
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
  });

  it('renders the active model label beside the mode badge in the admin header', () => {
    renderBar({ model: 'hermes-default', modelLabel: 'Hermes Default' });
    expect(screen.getByText('Hermes Default')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('guest variant appends the active model label to the Guest · Direct badge', () => {
    renderBar({ isGuest: true, modelLabel: 'DeepSeek' });
    expect(screen.getByText(/Guest · Direct · DeepSeek/)).toBeInTheDocument();
  });

  it('omits the model label when none is provided', () => {
    renderBar();
    expect(screen.queryByText(/Hermes|DeepSeek/)).not.toBeInTheDocument();
  });

  it('renders a compact model switcher when a catalog and change handler are supplied', () => {
    const onChange = vi.fn();
    const catalog = [
      { id: 'hermes-default', label: 'Hermes Default' },
      { id: 'claude-sonnet', label: 'Claude Sonnet' },
    ];
    renderBar({ models: catalog, onModelChange: onChange });
    const select = screen.getByLabelText('Ganti model') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('hermes-default');
    expect(screen.getByRole('option', { name: 'Claude Sonnet' })).toBeInTheDocument();
  });

  it('fires onModelChange when the mobile switcher selects a model', () => {
    const onChange = vi.fn();
    const catalog = [
      { id: 'hermes-default', label: 'Hermes Default' },
      { id: 'claude-sonnet', label: 'Claude Sonnet' },
    ];
    renderBar({ models: catalog, onModelChange: onChange, model: 'hermes-default' });
    fireEvent.change(screen.getByLabelText('Ganti model'), { target: { value: 'claude-sonnet' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('claude-sonnet');
  });

  it('falls back to the static model label when no switcher handler is provided', () => {
    renderBar({ model: 'hermes-default', modelLabel: 'Hermes Default', models: [{ id: 'hermes-default', label: 'Hermes Default' }] });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByText('Hermes Default')).toBeInTheDocument();
  });

  it('renders the model switcher as a 44px touch target', () => {
    const onChange = vi.fn();
    const catalog = [{ id: 'hermes-default', label: 'Hermes Default' }];
    renderBar({ models: catalog, onModelChange: onChange });
    const select = screen.getByLabelText('Ganti model');
    expect(select.className).toContain('min-h-[44px]');
    expect(select.className).toContain('text-base');
  });

  it('guest variant shows the model switcher only when wired with a catalog', () => {
    const onChange = vi.fn();
    const catalog = [{ id: 'hermes-default', label: 'Hermes Default' }];
    // With catalog + handler: the switcher renders and the logout stays.
    const wired = renderBar({ isGuest: true, models: catalog, onModelChange: onChange });
    expect(screen.getByLabelText('Ganti model')).toBeInTheDocument();
    expect(screen.getByLabelText('Keluar')).toBeInTheDocument();
    wired.unmount();
    // Without them, guest stays a static label (no switcher) — the fallback.
    renderBar({ isGuest: true });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Keluar')).toBeInTheDocument();
  });

  it('falls back to the static label when the active model is not in the catalog', () => {
    const onChange = vi.fn();
    const catalog = [{ id: 'hermes-default', label: 'Hermes Default' }];
    renderBar({ model: 'removed-model', modelLabel: 'Model lama', models: catalog, onModelChange: onChange });
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
    expect(screen.getByText('Model lama')).toBeInTheDocument();
  });
  it('guest variant renders a direct-model switcher when catalog + handler are supplied', () => {
    const onModelChange = vi.fn();
    const models = [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'claude-haiku', label: 'Claude Haiku' },
    ];
    renderBar({ isGuest: true, useAgent: true, model: 'gpt-4o-mini', models, onModelChange });
    const select = screen.getByLabelText('Ganti model') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('gpt-4o-mini');
    expect(screen.getByRole('option', { name: 'Claude Haiku' })).toBeInTheDocument();
  });

  it('guest switcher forwards a new model selection', () => {
    const onModelChange = vi.fn();
    const models = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    renderBar({ isGuest: true, model: 'a', models, onModelChange });
    fireEvent.change(screen.getByLabelText('Ganti model'), { target: { value: 'b' } });
    expect(onModelChange).toHaveBeenCalledWith('b');
  });

  it('guest variant falls back to the static label when no catalog is provided', () => {
    renderBar({ isGuest: true, modelLabel: 'DeepSeek' });
    expect(screen.getByText(/Guest · Direct/)).toBeInTheDocument();
    expect(screen.getByText(/DeepSeek/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ganti model')).not.toBeInTheDocument();
  });

});

describe('mobile stats readout', () => {
  it('opens the aggregate chat stats dialog when the cost chip is tapped', () => {
    const onOpenStats = vi.fn();
    renderBar({ usage: { promptTokens: 12, completionTokens: 8 }, onOpenStats });
    const chip = screen.getByRole('button', { name: /Penggunaan token:/ });
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(chip.className).toContain('min-h-[44px]');
    expect(chip.className).toContain('min-w-[44px]');
    expect(chip.textContent).toContain('token');
    fireEvent.click(chip);
    expect(onOpenStats).toHaveBeenCalledTimes(1);
  });

  it('keeps the readout non-interactive when no stats handler is wired', () => {
    renderBar({ usage: { promptTokens: 12, completionTokens: 8 } });
    expect(screen.queryByRole('button', { name: /Penggunaan token:/ })).not.toBeInTheDocument();
    const readout = screen.getByLabelText(/Penggunaan token:/);
    expect(readout.tagName).toBe('SPAN');
  });
});

describe('conversation title', () => {
  it('renders the active conversation title in chat view', () => {
    renderBar({ activeView: 'chat', title: 'Rencana PC part' });
    const label = screen.getByLabelText('Percakapan: Rencana PC part');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('Rencana PC part');
    expect(label.className).toContain('truncate');
  });

  it('does not render the title outside chat view', () => {
    renderBar({ activeView: 'expenses', title: 'Rencana PC part' });
    expect(screen.queryByLabelText(/Percakapan:/)).not.toBeInTheDocument();
  });

  it('omits the title when not provided', () => {
    renderBar({ activeView: 'chat' });
    expect(screen.queryByLabelText(/Percakapan:/)).not.toBeInTheDocument();
  });
});

describe('streaming indicator (mobile parity with ChatHeader)', () => {
  it('guest variant shows a live thinking indicator while streaming', () => {
    const { container } = renderBar({ isGuest: true, streaming: true, status: 'Berpikir', modelLabel: 'DeepSeek' });
    // The indicator is aria-hidden (the transcript's own live region announces),
    // so assert on the rendered pixel blocks + the aria-hidden wrapper.
    const loader = container.querySelector('[aria-hidden="true"]');
    expect(loader).toBeTruthy();
    expect(container.querySelectorAll('.pixel-think, .pixel-scan').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Berpikir');
    expect(container.textContent).toContain('DeepSeek');
  });

  it('admin variant shows a live thinking indicator in chat view while streaming', () => {
    const { container } = renderBar({ activeView: 'chat', streaming: true, status: 'Menyusun jawaban', modelLabel: 'Hermes Default' });
    expect(container.querySelectorAll('.pixel-think, .pixel-scan').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Menyusun jawaban');
    expect(container.textContent).toContain('Hermes Default');
  });

  it('admin variant hides the indicator outside chat view', () => {
    const { container } = renderBar({ activeView: 'expenses', streaming: true, status: 'Berpikir', modelLabel: 'Hermes Default' });
    expect(container.querySelectorAll('.pixel-think, .pixel-scan').length).toBe(0);
  });

  it('hides the indicator when not streaming', () => {
    const { container } = renderBar({ activeView: 'chat', streaming: false, status: 'Berpikir' });
    expect(container.querySelectorAll('.pixel-think, .pixel-scan').length).toBe(0);
  });
});


describe('MobileTopBar shortcuts button', () => {
  it('admin variant renders the help button and opens on click', () => {
    const onOpenShortcuts = vi.fn();
    renderBar({ onOpenShortcuts });
    fireEvent.click(screen.getByRole('button', { name: 'Pintasan keyboard' }));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('admin variant omits the button without a handler', () => {
    const { container } = renderBar();
    expect(container.textContent).not.toContain('Pintasan keyboard');
  });

  it('guest variant renders the help button when a handler is provided', () => {
    const onOpenShortcuts = vi.fn();
    renderBar({ isGuest: true, onOpenShortcuts });
    expect(screen.getByRole('button', { name: 'Pintasan keyboard' })).toBeInTheDocument();
  });
});

describe('MobileTopBar audit button', () => {
  it('admin chat view renders the audit button and opens on click', () => {
    const onOpenAudit = vi.fn();
    renderBar({ activeView: 'chat', onOpenAudit });
    const btn = screen.getByRole('button', { name: 'Audit percakapan' });
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(btn);
    expect(onOpenAudit).toHaveBeenCalledTimes(1);
  });

  it('omits the audit button when no handler is provided', () => {
    const { container } = renderBar({ activeView: 'chat' });
    expect(screen.queryByRole('button', { name: 'Audit percakapan' })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Audit percakapan');
  });

  it('hides the audit button on non-chat views', () => {
    renderBar({ activeView: 'expenses', onOpenAudit: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Audit percakapan' })).not.toBeInTheDocument();
  });

  it('guest variant never renders the audit button (no server session)', () => {
    renderBar({ isGuest: true, onOpenAudit: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Audit percakapan' })).not.toBeInTheDocument();
  });
});

describe('MobileTopBar guest copy-transcript', () => {
  it('guest variant renders the copy button and flashes confirmation on click', () => {
    const onCopyTranscript = vi.fn();
    renderBar({ isGuest: true, onCopyTranscript });
    const btn = screen.getByRole('button', { name: 'Salin percakapan' });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
    fireEvent.click(btn);
    expect(onCopyTranscript).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Percakapan tersalin' })).toBeInTheDocument();
  });

  it('guest variant omits the copy button without a handler', () => {
    renderBar({ isGuest: true });
    expect(screen.queryByRole('button', { name: 'Salin percakapan' })).not.toBeInTheDocument();
  });

  it('admin variant never renders the guest copy button', () => {
    renderBar({ onCopyTranscript: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Salin percakapan' })).not.toBeInTheDocument();
  });
});
