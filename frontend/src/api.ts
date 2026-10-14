import { API_URL } from './constants';
import type { ChatRequestBody } from './types';

/** A streamed piece of an assistant reply. */
export interface StreamChunk {
  /** Incremental assistant text, when the provider sent one. */
  content?: string;
  /** Sanitized error message from the backend, when streaming failed mid-flight. */
  error?: string;
}

/**
 * Raised when the streaming endpoint answers with a non-OK status, so callers
 * can map a status code to a localized, user-facing message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status: number, retryAfter: string | null = null) {
    super(`Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Parse a raw SSE buffer into complete events, returning the leftover partial
 * event so the caller can prepend it to the next chunk.
 *
 * Exported for unit testing: the framing rules (`\n\n` separator, `data: `
 * prefix, `[DONE]` terminator) are the part most likely to regress.
 */
export function parseSseBuffer(buffer: string): { events: StreamChunk[]; rest: string } {
  const events: StreamChunk[] = [];
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';

  for (const frame of frames) {
    if (!frame.startsWith('data: ')) continue;
    const data = frame.slice(6).trim();
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data) as StreamChunk;
      if (parsed.error) events.push({ error: parsed.error });
      else if (parsed.content) events.push({ content: parsed.content });
    } catch {
      // Ignore malformed frames: a single bad event must not kill the stream.
    }
  }

  return { events, rest };
}

/** Options accepted by {@link streamChat}. */
export interface StreamChatOptions {
  model: string;
  useHermesBridge: boolean;
  messages: ChatRequestBody['messages'];
  apiKey?: string;
  signal?: AbortSignal;
  /** Inject a fetch implementation for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * POST a chat request and yield content/error chunks as they arrive.
 *
 * Pure async generator: no React, no DOM beyond TextDecoder, so streaming is
 * testable without rendering. Throws {@link ApiError} for non-OK responses and
 * for a missing response body; rethrows the original error on abort.
 */
export async function* streamChat(options: StreamChatOptions): AsyncGenerator<StreamChunk> {
  const { model, useHermesBridge, messages, apiKey, signal, fetchImpl } = options;
  const doFetch = fetchImpl ?? fetch;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const body: ChatRequestBody = { model, useHermesBridge, messages };

  const res = await doFetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new ApiError(res.status, res.headers.get('Retry-After'));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const evt of events) yield evt;
  }

  // Flush a trailing frame that arrived without its terminating blank line.
  const tail = parseSseBuffer(`${buffer}\n\n`);
  for (const evt of tail.events) yield evt;
}
