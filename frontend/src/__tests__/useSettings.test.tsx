import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../hooks/useSettings';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default settings', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.systemPrompt).toBe('');
    expect(result.current.settings.temperature).toBe(0.7);
    expect(result.current.settings.maxTokens).toBe(2048);
  });

  it('updates system prompt and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSystemPrompt('You are an expert coder');
    });

    expect(result.current.settings.systemPrompt).toBe('You are an expert coder');
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.systemPrompt).toBe('You are an expert coder');
  });

  it('updates temperature and maxTokens', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateTemperature(1.2);
      result.current.updateMaxTokens(4096);
    });

    expect(result.current.settings.temperature).toBe(1.2);
    expect(result.current.settings.maxTokens).toBe(4096);
  });

  it('resets settings to defaults', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSystemPrompt('Custom');
      result.current.updateTemperature(0.2);
    });
    expect(result.current.settings.systemPrompt).toBe('Custom');

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings.systemPrompt).toBe('');
    expect(result.current.settings.temperature).toBe(0.7);
  });

  it('resetPersona resets only persona params, preserving night/focus modes', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSystemPrompt('Custom');
      result.current.updateTemperature(0.2);
      result.current.updateMaxTokens(4096);
      result.current.updateNightMode(true);
      result.current.updateFocusMode(true);
      result.current.updateChillMode(true);
    });
    act(() => {
      result.current.resetPersona();
    });
    expect(result.current.settings.systemPrompt).toBe('');
    expect(result.current.settings.temperature).toBe(0.7);
    expect(result.current.settings.maxTokens).toBe(2048);
    expect(result.current.settings.nightMode).toBe(true);
    expect(result.current.settings.focusMode).toBe(true);
    expect(result.current.settings.chillMode).toBe(false);
  });

  it('defaults night mode to off', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.nightMode).toBe(false);
  });

  it('updates night mode and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.nightMode).toBe(false);
    act(() => {
      result.current.updateNightMode(true);
    });
    expect(result.current.settings.nightMode).toBe(true);
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.nightMode).toBe(true);
  });

  it('defaults focus mode to off', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.focusMode).toBe(false);
  });

  it('updates focus mode and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.focusMode).toBe(false);
    act(() => {
      result.current.updateFocusMode(true);
    });
    expect(result.current.settings.focusMode).toBe(true);
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.focusMode).toBe(true);
  });

  it('defaults chill mode to off', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.chillMode).toBe(false);
  });

  it('updates chill mode and persists to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.chillMode).toBe(false);
    act(() => {
      result.current.updateChillMode(true);
    });
    expect(result.current.settings.chillMode).toBe(true);
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.chillMode).toBe(true);
  });
});
