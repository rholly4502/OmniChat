import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from '../hooks/usePersistedState';

describe('usePersistedState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts from the fallback when nothing is stored', () => {
    const { result } = renderHook(() => usePersistedState('k.x', ''));
    expect(result.current[0]).toBe('');
  });

  it('reads an already-stored value as the initial state', () => {
    window.localStorage.setItem('k.x', JSON.stringify('applied'));
    const { result } = renderHook(() => usePersistedState('k.x', ''));
    expect(result.current[0]).toBe('applied');
  });

  it('persists on set and survives a remount', () => {
    const key = 'k.y';
    const first = renderHook(() => usePersistedState(key, 'default'));
    act(() => first.result.current[1]('skor'));
    expect(first.result.current[0]).toBe('skor');

    // A fresh mount (same storage) should restore the persisted value.
    const second = renderHook(() => usePersistedState(key, 'default'));
    expect(second.result.current[0]).toBe('skor');
    expect(window.localStorage.getItem(key)).toBe(JSON.stringify('skor'));
  });

  it('falls back when the stored value is not valid JSON', () => {
    window.localStorage.setItem('k.z', 'not-json{');
    const { result } = renderHook(() => usePersistedState('k.z', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('persists booleans without corrupting the stored type', () => {
    const { result } = renderHook(() => usePersistedState('k.b', false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('k.b')).toBe('true');
  });

  it('supports functional updaters like useState', () => {
    const { result } = renderHook(() => usePersistedState('k.t', false));
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('k.t')).toBe('true');
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('k.t')).toBe('false');
  });
});
