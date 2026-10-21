import { useCallback, useRef, useState } from 'react';
import type { Message } from '../types';
import { streamChat, ApiError, type StreamChunk, type StreamChatOptions } from '../api';

/**
 * Drops a progress phase from a message.
 *
 * A phase means "this reply is still being written", so every terminal outcome has to
 * remove it — otherwise an errored or finished reply keeps advertising work in progress.
 * Returns the message untouched when it carried no phase, so React can bail out of the
 * state update instead of re-rendering on an identical object.
 */
function clearPhase(message: Message): Message {
  if (message.status === undefined) return message;
  const copy = { ...message };
  delete copy.status;
  return copy;
}

/** Options accepted by {@link useChat}. */
export interface UseChatOptions {
  /** Model id sent to the backend. */
  model: string;
  /** true → Hermes bridge, false → direct provider. */
  useHermesBridge: boolean;
  /** API key forwarded as `X-Api-Key`; empty string when unset. */
  apiKey: string;
  /**
   * Maps a transport failure to a localized, user-facing string. Injected
   * rather than imported so `api.ts` stays free of presentation copy.
   */
  describeError: (err: ApiError) => string;
  /** Injected for tests; defaults to the real SSE client. */
  streamImpl?: (options: StreamChatOptions) => AsyncGenerator<StreamChunk>;
}

/** Conversation state and the actions that mutate it. */
export interface UseChatResult {
  /** Full conversation, oldest first. The last entry is the in-flight reply. */
  messages: Message[];
  /** true while a reply is being streamed. */
  streaming: boolean;
  /** Append `content` as a user turn and stream the assistant reply. */
  send: (content: string) => Promise<void>;
  /** Abort the in-flight request, if any. No-op when idle. */
  stop: () => void;
  /** Drop the whole conversation. */
  clear: () => void;
}

/**
 * Owns the chat conversation: message state, SSE consumption, abort and error
 * presentation (frontend decomposition step 6).
 *
 * Behaviour is unchanged from the inline `send()`/`stopStreaming()` pair it
 * replaces in App.tsx:
 *  - the user turn and an empty assistant placeholder are appended up front,
 *    so the typing indicator has a target to attach to
 *  - content chunks are appended to the last message; error chunks append
 *    `⚠️ <detail>` after whatever text already arrived
 *  - a status chunk records the phase on the trailing assistant message so the
 *    transcript can explain a long wait, and is never appended as text
 *  - the phase is a claim about work *in flight*: the first content chunk and every
 *    terminal outcome (error, abort, failure) clear it, so a finished reply can never
 *    still be advertising that it is still being written
 *  - a thrown {@link ApiError} replaces the placeholder with the localized
 *    message from `describeError`
 *  - an abort keeps any partial reply, and drops the placeholder entirely if
 *    nothing arrived yet
 *  - any other failure surfaces `⚠️ Koneksi ke backend gagal: <message>`
 *  - `streaming` is cleared and the controller released in `finally`
 */
export function useChat(options: UseChatOptions): UseChatResult {
  const { model, useHermesBridge, apiKey, describeError, streamImpl } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => setMessages([]), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      const userMsg: Message = { role: 'user', content };
      const history = [...messages, userMsg];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const stream = streamImpl ?? streamChat;

      try {
        for await (const chunk of stream({
          model,
          useHermesBridge,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          apiKey,
          signal: ctrl.signal,
        })) {
          if (chunk.status) {
            const phase = chunk.status;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (!last || last.role !== 'assistant' || last.status === phase) return prev;
              copy[copy.length - 1] = { ...last, status: phase };
              return copy;
            });
          } else if (chunk.error) {
            const detail = chunk.error;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = clearPhase({
                role: 'assistant',
                content: last.content ? `${last.content}\n\n⚠️ ${detail}` : `⚠️ ${detail}`,
              });
              return copy;
            });
          } else if (chunk.content) {
            const piece = chunk.content;
            setMessages((prev) => {
              const copy = [...prev];
              const previous = copy[copy.length - 1];
              copy[copy.length - 1] = clearPhase({
                role: 'assistant',
                content: previous.content + piece,
                status: previous.status,
              });
              return copy;
            });
          }
        }
      } catch (e) {
        if (e instanceof ApiError) {
          const detail = describeError(e);
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `⚠️ ${detail}` },
          ]);
          return;
        }
        if ((e as Error).name !== 'AbortError') {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error('[OmniChat] Fetch error:', e);
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `⚠️ Koneksi ke backend gagal: ${errMsg}` },
          ]);
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && !last.content) {
              return [...prev.slice(0, -1)];
            }
            return prev;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, model, useHermesBridge, apiKey, describeError, streamImpl]
  );

  return { messages, streaming, send, stop, clear };
}
