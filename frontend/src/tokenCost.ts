import type { TokenUsage } from './types';

/**
 * Approximate per-1K-token USD rates (input/output), used ONLY for a rough
 * display estimate on the chat header and sidebar. These are published
 * list-price ballparks for a few common model families; actual billing is
 * provider-specific and may differ. The estimate is labelled "≈" in the UI.
 */
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-sonnet': { input: 0.003, output: 0.015 },
  'claude-haiku': { input: 0.001, output: 0.005 },
  'hermes-default': { input: 0.002, output: 0.008 },
  'hermes': { input: 0.002, output: 0.008 },
};

/** Conservative fallback for unknown models. */
const FALLBACK_RATE = { input: 0.001, output: 0.004 };

/** Estimated USD cost for a token usage, given the model id. */
export function estimateUsd(usage: TokenUsage, model: string): number {
  // OpenRouter free-tier endpoints ('...:free') cost nothing — report $0
  // instead of falling back to a paid per-1K rate.
  if (model.endsWith(':free')) return 0;
  const rate = MODEL_RATES[model] ?? FALLBACK_RATE;
  return (usage.promptTokens / 1000) * rate.input + (usage.completionTokens / 1000) * rate.output;
}

/** Compact human count: "850", "1.2k", "12k". */
export function formatTokens(n: number): string {
  if (Number.isFinite(n) && n >= 1000) {
    const v = (n / 1000).toFixed(1).replace(/\.0$/, '');
    return `${v}k`;
  }
  return String(n || 0);
}

/** Compact USD: "$0.0034" below a cent, otherwise "$0.42". */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
