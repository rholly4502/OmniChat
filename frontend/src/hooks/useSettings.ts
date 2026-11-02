import { useState, useEffect } from 'react';
import type { ChatSettings } from '../types';

const SETTINGS_KEY = 'omnichat_settings_v1';

const DEFAULT_SETTINGS: ChatSettings = {
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 2048,
  nightMode: false,
  focusMode: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<ChatSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable
    }
  }, [settings]);

  const updateSystemPrompt = (systemPrompt: string) => {
    setSettings((prev) => ({ ...prev, systemPrompt }));
  };

  const updateTemperature = (temperature: number) => {
    setSettings((prev) => ({ ...prev, temperature }));
  };

  const updateMaxTokens = (maxTokens: number) => {
    setSettings((prev) => ({ ...prev, maxTokens }));
  };

  const updateNightMode = (nightMode: boolean) => {
    setSettings((prev) => ({ ...prev, nightMode }));
  };

  const updateFocusMode = (focusMode: boolean) => {
    setSettings((prev) => ({ ...prev, focusMode }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  /** Reset only the persona/sampling params; night/focus modes stay as-is. */
  const resetPersona = () => {
    setSettings((prev) => ({
      ...prev,
      systemPrompt: DEFAULT_SETTINGS.systemPrompt,
      temperature: DEFAULT_SETTINGS.temperature,
      maxTokens: DEFAULT_SETTINGS.maxTokens,
    }));
  };

  return {
    settings,
    updateSystemPrompt,
    updateTemperature,
    updateMaxTokens,
    updateNightMode,
    updateFocusMode,
    resetSettings,
    resetPersona,
  };
}
