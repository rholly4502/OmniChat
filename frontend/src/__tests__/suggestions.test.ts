import { describe, it, expect } from 'vitest';
import { chatSuggestions } from '../suggestions';

describe('chatSuggestions', () => {
  it('returns the agent set for agent mode', () => {
    const list = chatSuggestions(true);
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.id)).toContain('agent-architecture');
    expect(list.map((s) => s.id)).not.toContain('direct-cleanarch');
    for (const s of list) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(s.label.length);
    }
  });

  it('returns the direct set for direct mode', () => {
    const list = chatSuggestions(false);
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.id)).toContain('direct-cleanarch');
    expect(list.map((s) => s.id)).not.toContain('agent-architecture');
  });

  it('accepts a model label without changing the result set', () => {
    const withLabel = chatSuggestions(true, 'Hermes (Default)');
    const without = chatSuggestions(true);
    expect(withLabel.map((s) => s.id)).toEqual(without.map((s) => s.id));
  });
});
