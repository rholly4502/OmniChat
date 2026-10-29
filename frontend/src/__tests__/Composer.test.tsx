import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from '../components/Composer';

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
