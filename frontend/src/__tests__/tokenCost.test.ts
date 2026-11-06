import { describe, expect, it } from 'vitest';
import {
  estimateTokens,
  estimateUsd,
  formatTokens,
  formatUsd,
  sortModelEntriesByCost,
} from '../tokenCost';
import type { TokenUsage } from '../types';

const usage: TokenUsage = { promptTokens: 1000, completionTokens: 1000 };

describe('estimateUsd', () => {
  it('treats OpenRouter :free tiers as zero-cost', () => {
    expect(estimateUsd(usage, 'nvidia/nemotron-3.5-lightning:free')).toBe(0);
    expect(estimateUsd(usage, 'google/gemini-2.0-flash-exp:free')).toBe(0);
  });

  it('uses the per-model rate table for paid models', () => {
    // hermes: input 0.002, output 0.008 per 1K each
    expect(estimateUsd(usage, 'hermes')).toBeCloseTo(0.002 + 0.008, 6);
    // gpt-4o: 0.0025 / 0.01
    expect(estimateUsd(usage, 'gpt-4o')).toBeCloseTo(0.0025 + 0.01, 6);
  });

  it('falls back to the conservative rate for unknown models', () => {
    expect(estimateUsd(usage, 'some/unknown-model')).toBeCloseTo(0.001 + 0.004, 6);
  });
});

describe('formatTokens', () => {
  it('formats plain and compact counts', () => {
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(1200)).toBe('1.2k');
    expect(formatTokens(12000)).toBe('12k');
    expect(formatTokens(0)).toBe('0');
  });
});

describe('formatUsd', () => {
  it('formats zero, sub-cent, and normal amounts', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.0034)).toBe('$0.0034');
    expect(formatUsd(0.42)).toBe('$0.42');
  });

  it('estimates tokens from text length with a minimum of 1', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('0123456789')).toBe(3); // round(10/4) = 3
    expect(estimateTokens('x'.repeat(40))).toBe(10);
  });
});

describe('sortModelEntriesByCost', () => {
  it('sorts entries by estimated cost descending (most expensive first)', () => {
    const entries: [string, { promptTokens: number; completionTokens: number }][] = [
      ['cheap', { promptTokens: 1000, completionTokens: 1000 }],   // fallback ~0.005
      ['pricey', { promptTokens: 1000, completionTokens: 2000 }],  // higher output cost
      ['openrouter/free-tier:free', { promptTokens: 4000, completionTokens: 4000 }],  // :free -> 0
    ];
    const sorted = sortModelEntriesByCost(entries).map(([id]) => id);
    expect(sorted[0]).toBe('pricey');
    expect(sorted[1]).toBe('cheap');
    expect(sorted[2]).toBe('openrouter/free-tier:free');
  });

  it('breaks ties by total tokens, then by model id (deterministic)', () => {
    const entries: [string, { promptTokens: number; completionTokens: number }][] = [
      ['b', { promptTokens: 1000, completionTokens: 1000 }],
      ['a', { promptTokens: 1000, completionTokens: 1000 }],
      ['c', { promptTokens: 2000, completionTokens: 1000 }],
    ];
    const sorted = sortModelEntriesByCost(entries).map(([id]) => id);
    // same cost, more tokens first; then 'a' < 'b'
    expect(sorted).toEqual(['c', 'a', 'b']);
  });

  it('leaves an empty list unchanged', () => {
    expect(sortModelEntriesByCost([])).toEqual([]);
  });
});
