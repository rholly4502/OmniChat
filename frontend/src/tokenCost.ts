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
  'gpt-4.1': { input: 0.0025, output: 0.01 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'deepseek-chat': { input: 0.00027, output: 0.0011 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
};

/** Conservative fallback for unknown models. */
const FALLBACK_RATE = { input: 0.001, output: 0.004 };

/** Provenance of a resolved per-model rate. */
export interface ModelRateInfo {
  /** Per-1K-token input rate (USD). */
  input: number;
  /** Per-1K-token output rate (USD). */
  output: number;
  /** 'known' = from the table; 'fallback' = conservative unknown-model rate; 'free' = OpenRouter :free tier. */
  source: 'known' | 'fallback' | 'free';
}

/**
 * Resolve the per-1K-token USD rate for a model id and report how it was
 * derived, so the UI can make the estimate auditable (the cost readout is an
 * approximation, not a bill). Free-tier endpoints ('...:free') resolve to zero.
 */
/**
 * Reduces a provider-qualified id to its bare family name so a known family is
 * still recognized when the routing catalog names an endpoint (e.g.
 * `openai/gpt-4o` → `gpt-4o`, `anthropic/claude-sonnet` → `claude-sonnet`).
 * Returns the input unchanged when there is no `/` or nothing follows it.
 */
function bareModelId(model: string): string {
  const slash = model.lastIndexOf('/');
  if (slash < 0) return model;
  const bare = model.slice(slash + 1);
  return bare.length > 0 ? bare : model;
}

export function getModelRate(model: string): ModelRateInfo {
  if (model.endsWith(':free')) return { input: 0, output: 0, source: 'free' };
  const rate = MODEL_RATES[model] ?? MODEL_RATES[bareModelId(model)];
  return rate ? { ...rate, source: 'known' } : { ...FALLBACK_RATE, source: 'fallback' };
}

/** Estimated USD cost for a token usage, given the model id. */
export function estimateUsd(usage: TokenUsage, model: string): number {
  const { input, output } = getModelRate(model);
  return (usage.promptTokens / 1000) * input + (usage.completionTokens / 1000) * output;
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
  return [...entries].sort((a, b) => {
    const aUsd = estimateUsd({ promptTokens: a[1].promptTokens, completionTokens: a[1].completionTokens }, a[0]);
    const bUsd = estimateUsd({ promptTokens: b[1].promptTokens, completionTokens: b[1].completionTokens }, b[0]);
    if (aUsd !== bUsd) return bUsd - aUsd;
    const aTok = a[1].promptTokens + a[1].completionTokens;
    const bTok = b[1].promptTokens + b[1].completionTokens;
    if (aTok !== bTok) return bTok - aTok;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
}
