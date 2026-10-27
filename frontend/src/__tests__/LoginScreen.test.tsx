import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginScreen from '../components/LoginScreen';

function renderLogin(overrides: Partial<Parameters<typeof LoginScreen>[0]> = {}) {
  const props = {
    onSubmit: vi.fn(async () => true),
    onEnterGuest: vi.fn(),
    busy: false,
    error: null,
    ...overrides,
  };
  return { ...render(<LoginScreen {...props} />), props };
}

describe('LoginScreen', () => {
  it('renders the brand and the credential field', () => {
    renderLogin();
    expect(screen.getByText('OmniChat')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument();
  });

  it('does not submit while the input is empty', () => {
    const { props } = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed key on enter', async () => {
    const { props } = renderLogin();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: '  sk-abc  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('sk-abc'));
  });

  it('renders the error message when provided', () => {
    renderLogin({ error: 'API key salah.' });
    expect(screen.getByRole('alert')).toHaveTextContent('API key salah.');
  });

  it('shows verifying state and disables the button while busy', () => {
    renderLogin({ busy: true });
    const button = screen.getByRole('button', { name: 'Memverifikasi…' });
    expect(button).toBeDisabled();
  });

  it('toggles the key visibility', () => {
    renderLogin();
    const input = screen.getByLabelText('API key') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan kunci' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('keeps the reveal toggle at the 14px control floor', () => {
    renderLogin();
    const toggle = screen.getByRole('button', { name: 'Tampilkan kunci' });
    expect(toggle.className).toContain('text-sm');
    expect(toggle.className).not.toContain('text-xs');
  });

  it('shows a visible focus ring on every interactive control', () => {
    renderLogin();
    const reveal = screen.getByRole('button', { name: 'Tampilkan kunci' });
    const submit = screen.getByRole('button', { name: 'Masuk' });
    const input = screen.getByLabelText('API key');
    expect(reveal.className).toContain('focus-visible:ring-2');
    expect(submit.className).toContain('focus-visible:ring-2');
    expect(input.className).toContain('focus-visible:ring-2');
  });

  it('renders the guest button and calls onEnterGuest when clicked', () => {
    const { props } = renderLogin();
    const guest = screen.getByRole('button', { name: 'Lanjut sebagai tamu' });
    expect(guest).toBeInTheDocument();
    expect(guest).toHaveAttribute('type', 'button');
    fireEvent.click(guest);
    expect(props.onEnterGuest).toHaveBeenCalledTimes(1);
  });

  it('keeps the guest button at the 44px touch floor with a focus ring', () => {
    renderLogin();
    const guest = screen.getByRole('button', { name: 'Lanjut sebagai tamu' });
    expect(guest.className).toContain('min-h-[44px]');
    expect(guest.className).toContain('focus-visible:ring-2');
    expect(guest.className).toContain('text-sm');
  });
});

