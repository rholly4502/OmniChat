import type { Message, TokenUsage } from './types';

/**
 * Sum per-message token usage across a transcript.
 *
 * Used to seed the live usage counter after a transcript is reloaded as a
 * consequence of deleting turns (or otherwise replacing the message list):
 * the server's cumulative session totals are the authoritative source when they
 * exist, but on a delete the client has only the freshly reloaded messages, and
 * reading the pre-delete session totals would keep counting the deleted turns.
 */
export function sumMessageUsage(messages: Message[]): TokenUsage {
  return messages.reduce<TokenUsage>(
    (acc, m) => ({
      promptTokens: acc.promptTokens + (m.usage?.promptTokens ?? 0),
      completionTokens: acc.completionTokens + (m.usage?.completionTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
}
