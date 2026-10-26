import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuthGate } from '../hooks/useAuthGate';
import { validateApiKey } from '../authApi';

vi.mock('../authApi', () => ({
  validateApiKey: vi.fn(),
}));

const mockedValidate = vi.mocked(validateApiKey);

describe('useAuthGate', () => {
  beforeEach(() => {
    mockedValidate.mockReset();
  });

  it('starts locked when no key is stored', () => {
    const { result } = renderHook(() => useAuthGate('', vi.fn()));
    expect(result.current.locked).toBe(true);
  });

  it('unlocks immediately and re-validates a stored key silently', async () => {
    mockedValidate.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAuthGate('sk-store', vi.fn()));

    expect(result.current.locked).toBe(false); // optimistic first paint
    await waitFor(() => expect(mockedValidate).toHaveBeenCalledWith('sk-store'));
  });

  it('locks the app when the stored key is rejected on boot', async () => {
    mockedValidate.mockResolvedValue({ ok: false, reason: 'salah' });
    const { result } = renderHook(() => useAuthGate('sk-bad', vi.fn()));

    await waitFor(() => expect(result.current.locked).toBe(true));
    expect(result.current.error).toBe('salah');
  });

  it('successful attemptLogin stores the key and unlocks', async () => {
    mockedValidate.mockResolvedValue({ ok: true });
    const setApiKey = vi.fn();
    const { result } = renderHook(() => useAuthGate('', setApiKey));

    let ok = false;
    await act(async () => {
      ok = await result.current.attemptLogin('sk-new');
    });

    expect(ok).toBe(true);
    expect(setApiKey).toHaveBeenCalledWith('sk-new');
    expect(result.current.locked).toBe(false);
  });

  it('failed attemptLogin keeps the app locked and surfaces the reason', async () => {
    mockedValidate.mockResolvedValue({ ok: false, reason: 'salah' });
    const setApiKey = vi.fn();
    const { result } = renderHook(() => useAuthGate('', setApiKey));

    let ok = true;
    await act(async () => {
      ok = await result.current.attemptLogin('sk-bad');
    });

    expect(ok).toBe(false);
    expect(setApiKey).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
    expect(result.current.error).toBe('salah');
  });

  it('logout clears the credential and returns to the login screen', () => {
    mockedValidate.mockResolvedValue({ ok: true });
    const setApiKey = vi.fn();
    const { result } = renderHook(() => useAuthGate('sk-store', setApiKey));

    act(() => result.current.logout());

    expect(setApiKey).toHaveBeenCalledWith('');
    expect(result.current.locked).toBe(true);
  });
});
