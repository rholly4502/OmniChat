import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposerDraft, COMPOSER_DRAFT_KEY } from '../hooks/useComposerDraft';

describe('useComposerDraft', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts empty when nothing is saved', () => {
    const { result } = renderHook(() => useComposerDraft());
    expect(result.current.draft).toBe('');
  });

  it('restores a previously-saved draft on mount', () => {
    localStorage.setItem(COMPOSER_DRAFT_KEY, 'Halo dunia');
    const { result } = renderHook(() => useComposerDraft());
    expect(result.current.draft).toBe('Halo dunia');
  });

  it('persists the draft as the user types', () => {
    const { result } = renderHook(() => useComposerDraft());
    act(() => result.current.setDraft('pesan panjang'));
    expect(localStorage.getItem(COMPOSER_DRAFT_KEY)).toBe('pesan panjang');
  });

  it('removes the stored entry when the draft is cleared', () => {
    localStorage.setItem(COMPOSER_DRAFT_KEY, 'ada isi');
    const { result } = renderHook(() => useComposerDraft());
    act(() => result.current.clearDraft());
    expect(result.current.draft).toBe('');
    expect(localStorage.getItem(COMPOSER_DRAFT_KEY)).toBeNull();
  });

  it('removes the stored entry when the draft becomes blank', () => {
    localStorage.setItem(COMPOSER_DRAFT_KEY, 'isi dulu');
    const { result } = renderHook(() => useComposerDraft());
    act(() => result.current.setDraft('   '));
    expect(result.current.draft).toBe('   ');
    expect(localStorage.getItem(COMPOSER_DRAFT_KEY)).toBeNull();
  });
});
