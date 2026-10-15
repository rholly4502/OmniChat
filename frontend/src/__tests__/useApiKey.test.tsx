import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiKey } from '../hooks/useApiKey';
import { API_KEY_STORAGE } from '../constants';

/**
 * Unit tests for the persisted API-key hook (frontend decomposition step 9).
 * These pin the localStorage contract the inline App.tsx state+effect had.
 */
describe('useApiKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useApiKey());
    expect(result.current[0]).toBe('');
  });

  it('reads the stored key on first paint', () => {
    localStorage.setItem(API_KEY_STORAGE, 'stored-key');
    const { result } = renderHook(() => useApiKey());
    expect(result.current[0]).toBe('stored-key');
  });

  it('persists a change to localStorage', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current[1]('fresh-key'));
    expect(result.current[0]).toBe('fresh-key');
    expect(localStorage.getItem(API_KEY_STORAGE)).toBe('fresh-key');
  });

  it('removes the entry when the key is cleared', () => {
    localStorage.setItem(API_KEY_STORAGE, 'stored-key');
    const { result } = renderHook(() => useApiKey());
    act(() => result.current[1](''));
    expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
  });
});
