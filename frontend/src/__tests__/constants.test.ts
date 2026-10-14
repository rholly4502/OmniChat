import { describe, it, expect } from 'vitest';
import {
  API_URL,
  MODELS_URL,
  API_KEY_STORAGE,
  DEFAULT_AGENT_MODELS,
  DEFAULT_DIRECT_MODELS,
  DEFAULT_MODEL,
} from '../constants';

describe('constants', () => {
  it('exposes the streaming and catalog endpoints', () => {
    expect(API_URL).toBe('/api/chat/stream');
    expect(MODELS_URL).toBe('/api/models');
  });

  it('namespaces the api key storage key', () => {
    expect(API_KEY_STORAGE).toBe('omnichat_api_key');
  });

  it('defaults to the hermes agent model', () => {
    expect(DEFAULT_MODEL).toBe('hermes');
  });

  it('provides non-empty fallback catalogs', () => {
    expect(DEFAULT_AGENT_MODELS.length).toBeGreaterThan(0);
    expect(DEFAULT_DIRECT_MODELS.length).toBeGreaterThan(0);
  });

  it('gives every fallback model an id and a label', () => {
    for (const m of [...DEFAULT_AGENT_MODELS, ...DEFAULT_DIRECT_MODELS]) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });

  it('keeps fallback model ids unique', () => {
    const ids = [...DEFAULT_AGENT_MODELS, ...DEFAULT_DIRECT_MODELS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default model in the agent fallback catalog', () => {
    expect(DEFAULT_AGENT_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
  });
});
