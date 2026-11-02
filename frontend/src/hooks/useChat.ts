import { useCallback, useRef, useState } from 'react';
import type { Message, TokenUsage } from '../types';
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
  /** Optional custom system prompt / persona. */
  systemPrompt?: string;
  /** Sampling temperature (0.0 - 2.0). */
  temperature?: number;
  /** Maximum generation tokens. */
  maxTokens?: number;
  /**
   * Maps a transport failure to a localized, user-facing string. Injected
   * rather than imported so `api.ts` stays free of presentation copy.
   */
  describeError: (err: ApiError) => string;
  /** Injected for tests; defaults to the real SSE client. */
  streamImpl?: (options: StreamChatOptions) => AsyncGenerator<StreamChunk>;
  /** Optional initial messages when restoring a session. */
  initialMessages?: Message[];
  /**
   * Called when the backend names the thread this turn was filed under. Lets the
   * history hook promote a local draft to a stored conversation without making
   * the transcript re-render just because the server picked an id.
   */
  onConversationId?: (id: string) => void;
  /**
   * Called with the cumulative token usage for the current thread after a usage
   * frame arrives. Used to update the header/export without re-rendering on
   * every token.
   */
  onUsage?: (usage: TokenUsage) => void;
}

/** Conversation state and the actions that mutate it. */
export interface UseChatResult {
  /** Full conversation, oldest first. The last entry is the in-flight reply. */
  messages: Message[];
  /** true while a reply is being streamed. */
  streaming: boolean;
  /** Append `content` as a user turn and stream the assistant reply. */
  send: (content: string) => Promise<void>;
  /**
   * Re-run the last turn: drop the trailing assistant reply and stream a fresh
   * one from the same user context. No-op while streaming, on an empty
   * conversation, or when the newest message is not a user turn.
   */
  regenerate: () => Promise<void>;
  /**
   * Replace the user message at `index` with `newContent`, discard everything
   * after it, and stream a fresh assistant reply from the edited context.
   * No-op while streaming or when `index` is not a user message.
   */
  editAndResend: (index: number, newContent: string) => Promise<void>;
  /** Abort the in-flight request, if any. No-op when idle. */
  stop: () => void;
  /** Drop the whole conversation. */
  clear: () => void;
  /** Cumulative token usage for the current thread (server base + live frames). */
  usage: TokenUsage;
  /**
   * Replace current messages with a loaded session.
   *
   * Pass the conversation id when the session came from the server, so the next
   * turn continues that thread instead of starting a second one; omit it for a
   * draft or a cleared transcript.
   */
  loadMessages: (newMessages: Message[], conversationId?: string | null, initialUsage?: TokenUsage) => void;
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
 *
 * Regenerate and edit-resend reuse the same {@link runTurn} core, so they share
 * every streaming/error/abort guarantee with a plain send.
 */
export function useChat(options: UseChatOptions): UseChatResult {
  const { model, useHermesBridge, apiKey, systemPrompt, temperature, maxTokens, describeError, streamImpl, initialMessages, onConversationId, onUsage } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0 });
  /** Imperative mirror of `usage` so onUsage can fire outside a state updater. */
  const usageRef = useRef<TokenUsage>({ promptTokens: 0, completionTokens: 0 });
  const recordUsage = useCallback(
    (u: TokenUsage) => {
      const next = {
        promptTokens: usageRef.current.promptTokens + u.promptTokens,
        completionTokens: usageRef.current.completionTokens + u.completionTokens,
      };
      usageRef.current = next;
      setUsage(next);
      onUsage?.(next);
    },
    [onUsage],
  );

  /** Subtract a discarded turn's tokens from the cumulative total (clamped at 0). */
  const subtractUsage = useCallback(
    (u: TokenUsage) => {
      const next = {
        promptTokens: Math.max(0, usageRef.current.promptTokens - u.promptTokens),
        completionTokens: Math.max(0, usageRef.current.completionTokens - u.completionTokens),
      };
      usageRef.current = next;
      setUsage(next);
      onUsage?.(next);
    },
    [onUsage],
  );
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Backend id of the thread this conversation is being filed under. A ref, not
   * state: it is only ever read at send time, and re-rendering the transcript
   * because the server named a thread would be waste. Reset whenever the visible
   * conversation is replaced, so a cleared or switched session never appends to
   * the previous thread's history.
   */
  const conversationIdRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    conversationIdRef.current = null;
    usageRef.current = { promptTokens: 0, completionTokens: 0 };
    setUsage({ promptTokens: 0, completionTokens: 0 });
    setMessages([]);
  }, []);

  const loadMessages = useCallback((newMessages: Message[], conversationId: string | null = null, initialUsage?: TokenUsage) => {
    conversationIdRef.current = conversationId;
    const base = initialUsage ?? { promptTokens: 0, completionTokens: 0 };
    usageRef.current = { promptTokens: base.promptTokens, completionTokens: base.completionTokens };
    setUsage(usageRef.current);
    setMessages(newMessages);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Core of a single assistant turn. Takes the context history (user turns and
   * any earlier assistant replies) that should be sent to the backend, appends
   * an empty assistant placeholder, and streams the reply into it.
   *
   * `history` is the *complete* outgoing context — for a plain send it already
   * includes the new user turn; for regenerate it is the transcript with the
   * trailing assistant reply removed; for edit-resend it is the transcript up to
   * and including the edited user turn. The placeholder is always appended here,
   * never by the caller.
   */
  const runTurn = useCallback(
    async (history: Message[]) => {
      if (streaming) return;

      const outgoingMessages: Message[] = [];
      if (systemPrompt && systemPrompt.trim()) {
        outgoingMessages.push({ role: 'system', content: systemPrompt.trim() });
      }
      outgoingMessages.push(...history.map((m) => ({ role: m.role, content: m.content })));

      setMessages([...history, { role: 'assistant', content: '' }]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const stream = streamImpl ?? streamChat;

      // Per-turn usage accumulator: the provider reports usage on the final chunk of
      // the turn, and we attach those tokens to the trailing assistant message so the
      // transcript can show a per-message cost footnote. Distinct from the cumulative
      // `usageRef`, which keeps the header/sidebar total.
      const turnUsage = { promptTokens: 0, completionTokens: 0 };
      // Model that produced this turn, read from the usage frame. It prices the
      // per-message footnote with the rate of the model that actually generated the
      // reply, even when the selector has moved on to another model.
      let turnModel = '';

      try {
        for await (const chunk of stream({
          model,
          useHermesBridge,
          messages: outgoingMessages,
          apiKey,
          temperature,
          maxTokens,
          conversationId: conversationIdRef.current,
          signal: ctrl.signal,
        })) {
          if (chunk.conversationId) {
            // Not a message: it names the thread the turn was filed under.
            conversationIdRef.current = chunk.conversationId;
            onConversationId?.(chunk.conversationId);
          } else if (chunk.status) {
            const phase = chunk.status;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (!last || last.role !== 'assistant' || last.status === phase) return prev;
              copy[copy.length - 1] = { ...last, status: phase };
              return copy;
            });
          } else if (chunk.usage) {
            recordUsage(chunk.usage);
            turnUsage.promptTokens += chunk.usage.promptTokens;
            turnUsage.completionTokens += chunk.usage.completionTokens;
            if (chunk.usage.model) turnModel = chunk.usage.model;
          } else if (chunk.messageId) {
            // The backend filed the assistant reply and forwarded its id right before
            // [DONE]. Attach it to the trailing assistant message so like/dislike can
            // be persisted without a reload.
            const id = chunk.messageId;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (!last || last.role !== 'assistant') return prev;
              copy[copy.length - 1] = { ...last, id };
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

        if (turnUsage.promptTokens > 0 || turnUsage.completionTokens > 0) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            copy[copy.length - 1] = {
              ...last,
              usage: { ...turnUsage },
              ...(turnModel ? { model: turnModel } : {}),
            };
            return copy;
          });
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
    [streaming, systemPrompt, model, useHermesBridge, apiKey, temperature,
     maxTokens, describeError, streamImpl, onConversationId, recordUsage]
  );

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;
      await runTurn([...messages, { role: 'user', content }]);
    },
    [messages, streaming, runTurn]
  );

  const regenerate = useCallback(
    async () => {
      if (streaming) return;
      // Drop a trailing assistant reply; the user turn that prompted it stays.
      let history = messages;
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        if (last.usage) subtractUsage(last.usage);
        history = history.slice(0, -1);
      }
      // There must be a user turn to re-answer.
      const tail = history[history.length - 1];
      if (!tail || tail.role !== 'user') return;
      await runTurn(history);
    },
    [messages, streaming, runTurn, subtractUsage]
  );

  const editAndResend = useCallback(
    async (index: number, newContent: string) => {
      if (streaming) return;
      if (!newContent.trim()) return;
      const target = messages[index];
      if (!target || target.role !== 'user') return;
      // Replace the edited turn and drop everything that followed it. The discarded
      // turns' tokens leave the cumulative total, so the header/sidebar cost does
      // not keep counting replies that no longer exist in the transcript.
      const discarded = messages.slice(index + 1);
      const dropped = { promptTokens: 0, completionTokens: 0 };
      for (const m of discarded) {
        if (m.usage) {
          dropped.promptTokens += m.usage.promptTokens;
          dropped.completionTokens += m.usage.completionTokens;
        }
      }
      if (dropped.promptTokens > 0 || dropped.completionTokens > 0) subtractUsage(dropped);
      await runTurn([...messages.slice(0, index), { role: 'user', content: newContent }]);
    },
    [messages, streaming, runTurn, subtractUsage]
  );

  return { messages, streaming, send, regenerate, editAndResend, stop, clear, loadMessages, usage };
}
