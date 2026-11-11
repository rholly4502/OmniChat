import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from '../components/Composer';
import { estimateTokens, estimateUsd, formatTokens, formatUsd } from '../tokenCost';

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    input: '',
    onInputChange: vi.fn(),
    streaming: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<Composer {...props} />);
  return props;
}

describe('Composer', () => {
  it('labels the input and hints the mobile keyboard to show Send', () => {
    renderComposer();
    const input = screen.getByLabelText('Ketik pesan');
    expect(input).toHaveAttribute('enterKeyHint', 'send');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('reports every keystroke through onInputChange', () => {
    const props = renderComposer();
    fireEvent.change(screen.getByLabelText('Ketik pesan'), { target: { value: 'Halo' } });
    expect(props.onInputChange).toHaveBeenCalledWith('Halo');
  });

  it('disables Send while the draft is empty or whitespace only', () => {
    renderComposer({ input: '   ' });
    expect(screen.getByText('Kirim')).toBeDisabled();
  });

  it('enables Send once the draft has content', () => {
    renderComposer({ input: 'Halo' });
    expect(screen.getByText('Kirim')).toBeEnabled();
  });

  it('submits on Send click', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.click(screen.getByText('Kirim'));
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'Enter' });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('does not submit on Shift+Enter so users can type newlines', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'Enter', shiftKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('ignores other keys so typing does not submit', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'a' });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('swaps Send for Stop while streaming and aborts on click', () => {
    const props = renderComposer({ input: 'Halo', streaming: true });
    expect(screen.queryByText('Kirim')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Stop'));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it('disables the input and prompts while streaming', () => {
    renderComposer({ streaming: true });
    const input = screen.getByLabelText('Ketik pesan');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Menunggu respons…');
  });

  it('prompts for input when idle', () => {
    renderComposer();
    expect(screen.getByLabelText('Ketik pesan')).toHaveAttribute('placeholder', 'Ketik pesan…');
  });

  /**
   * iOS Safari auto-zooms on focus for any input under 16px. The class list has
   * to carry the mobile-first 16px with a 14px desktop override; asserting the
   * source class is deliberate, because computed font-size lies under CDP
   * mobile emulation.
   */
  it('keeps the 16px-on-mobile class to avoid iOS focus zoom', () => {
    renderComposer();
    expect(screen.getByLabelText('Ketik pesan').className).toContain('text-base md:text-sm');
  });

  it('applies the chill-vibe pixel-art treatment to the primary controls', () => {
    renderComposer({ input: 'Halo' });
    // Warm sand accent + hard offset pixel shadow + sharp corners on Send.
    const send = screen.getByText('Kirim');
    expect(send.className).toContain('bg-chill-accent');
    expect(send.className).toContain('text-chill-on-accent');
    expect(send.className).toContain('pixel-shadow');
    expect(send.className).toContain('rounded-none');
    // The draft surface is warm, sharply bordered, and keeps its 16px mobile floor.
    const input = screen.getByLabelText('Ketik pesan');
    expect(input.className).toContain('bg-chill-surface');
    expect(input.className).toContain('border-chill-border');
    expect(input.className).toContain('rounded-none');
    expect(input.className).toContain('text-base md:text-sm');
    // Destructive stop keeps the warm palette too.
    renderComposer({ input: 'Halo', streaming: true });
    expect(screen.getByText('Stop').className).toContain('bg-chill-red');
  });

  it('keeps every touch target at least 44px tall', () => {
    renderComposer({ input: 'Halo' });
    expect(screen.getByLabelText('Ketik pesan').className).toContain('min-h-[44px]');
    expect(screen.getByText('Kirim').className).toContain('min-h-[44px]');
  });
});

describe('Composer keyboard shortcuts', () => {
  it('sends on Ctrl+Enter', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'Enter', ctrlKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('sends on Cmd+Enter (meta)', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'Enter', metaKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('still treats Shift+Enter as a newline (no ctrl/meta)', () => {
    const props = renderComposer({ input: 'Halo' });
    fireEvent.keyDown(screen.getByLabelText('Ketik pesan'), { key: 'Enter', shiftKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
  });
});

describe('Composer draft token/cost estimate', () => {
  it('shows a live estimate when a model id is provided', () => {
    const input = 'x'.repeat(200);
    renderComposer({ input, model: 'hermes-default' });
    const tokens = estimateTokens(input.trim());
    const cost = formatUsd(estimateUsd({ promptTokens: tokens, completionTokens: 0 }, 'hermes-default'));
    expect(screen.getByText(`≈ ${formatTokens(tokens)} tok · ≈${cost}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`Perkiraan pesan: ${formatTokens(tokens)} token, perkiraan biaya ${cost}`)).toBeInTheDocument();
  });

  it('renders nothing when the draft is empty or whitespace', () => {
    renderComposer({ input: '   ', model: 'hermes-default' });
    expect(screen.queryByText(/≈ .* tok/)).not.toBeInTheDocument();
    renderComposer({ model: 'hermes-default' });
    expect(screen.queryByText(/≈ .* tok/)).not.toBeInTheDocument();
  });

  it('renders nothing when no model is provided', () => {
    renderComposer({ input: 'Halo' });
    expect(screen.queryByText(/≈ .* tok/)).not.toBeInTheDocument();
  });
});


describe('Composer disabled Send state (inactive contrast)', () => {
  it('a disabled primary button suppresses hover/shadow so it reads inactive', () => {
    // Empty draft -> Send is disabled. It must not look pressable: no raised
    // pixel shadow and no hover-lighten while disabled, while its base accent
    // still renders so the inactive look comes from the explicit disabled
    // variants, not from a missing base style.
    renderComposer({ input: '   ' });
    const send = screen.getByText('Kirim');
    expect(send).toBeDisabled();
    const cls = send.className;
    expect(cls).toContain('disabled:opacity-40');
    expect(cls).toContain('disabled:cursor-not-allowed');
    expect(cls).toContain('disabled:shadow-none');
    expect(cls).toContain('disabled:hover:bg-chill-accent');
    // Base accent + square edge + hard shadow still present for the enabled state.
    expect(cls).toContain('bg-chill-accent');
    expect(cls).toContain('pixel-shadow');
    expect(cls).toContain('rounded-none');
  });
});
