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

/**
 * Rough estimate of the number of tokens in `text`, used only for the live
 * streaming counter while a reply is still being generated (the authoritative
 * count arrives later with the turn's usage frame). Assumes ~4 chars per token,
 * which is a serviceable approximation for the mixed EN/ID chat content; min 1
 * so any non-empty frame advances the ticker.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
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

/** A per-model usage row: model id + token counts (the shape shared by the
 * ChatStatsDialog, the sidebar "Penggunaan" section, and the conversation audit
 * dialog). */
export interface ModelUsageRow {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Sort per-model usage entries by estimated USD cost descending, so the most
 * expensive model appears first in the per-model tables. The incoming entries
 * are in server insertion order (or Map insertion order), which is unrelated to
 * cost; showing the biggest expense first is what the cost-tracking feature is
 * actually for. Ties fall back to total tokens, then to the model id, so the
 * order is deterministic for a given dataset.
 */
export function sortModelEntriesByCost<T extends ModelUsageRow>(
  entries: [string, T][],
): [string, T][] {
  return entries.sort((a, b) => {
    const aUsd = estimateUsd({ promptTokens: a[1].promptTokens, completionTokens: a[1].completionTokens }, a[0]);
    const bUsd = estimateUsd({ promptTokens: b[1].promptTokens, completionTokens: b[1].completionTokens }, b[0]);
    if (aUsd !== bUsd) return bUsd - aUsd;
    const aTok = a[1].promptTokens + a[1].completionTokens;
    const bTok = b[1].promptTokens + b[1].completionTokens;
    if (aTok !== bTok) return bTok - aTok;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
}
