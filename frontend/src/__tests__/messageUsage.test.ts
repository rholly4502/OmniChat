import { describe, it, expect } from 'vitest';
import { sumMessageUsage } from '../messageUsage';
import type { Message } from '../types';

const msg = (over: Partial<Message> = {}): Message => ({
  role: 'assistant',
  content: 'x',
  ...over,
});

describe('sumMessageUsage', () => {
  it('sums usage across messages, treating missing usage as zero', () => {
    const messages: Message[] = [
      msg({ role: 'user', content: 'halo' }),
      msg({ usage: { promptTokens: 12, completionTokens: 8 } }),
      msg({ usage: { promptTokens: 30, completionTokens: 20 } }),
      msg({}),
    ];
    expect(sumMessageUsage(messages)).toEqual({ promptTokens: 42, completionTokens: 28 });
  });

  it('returns zero usage for an empty or all-user transcript', () => {
    expect(sumMessageUsage([])).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(sumMessageUsage([msg({ role: 'user' }), msg({ role: 'user' })])).toEqual({
      promptTokens: 0,
      completionTokens: 0,
    });
  });
});
