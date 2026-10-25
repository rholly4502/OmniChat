import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { ApiError, type StreamChunk, type StreamChatOptions } from '../api';

/**
 * Unit tests for the extracted conversation hook (frontend decomposition
 * step 6). These pin the behaviour the inline send()/stop() pair had in
 * App.tsx, so the refactor cannot silently change error or abort handling.
 *
 * The SSE client is injected (`streamImpl`) rather than fetch-mocked: the
 * real transport already has its own coverage in api.test.ts, and a fake
 * generator lets each failure mode (error chunk, ApiError, abort, crash) be
 * driven deterministically.
 */

/** Build a stream implementation that yields `chunks` then optionally throws. */
function streamOf(chunks: StreamChunk[], thrown?: unknown) {
  return (options: StreamChatOptions): AsyncGenerator<StreamChunk> =>
    (async function* () {
      for (const c of chunks) {
        if (options.signal?.aborted) throw abortError();
        yield c;
      }
      if (thrown) throw thrown;
    })();
}

/** A generator that yields one chunk, then parks until its signal aborts. */
function streamUntilAbort() {
  return (options: StreamChatOptions): AsyncGenerator<StreamChunk> =>
    (async function* () {
      yield { content: 'partial' };
      await new Promise<never>((_, reject) => {
        if (options.signal?.aborted) return reject(abortError());
        options.signal?.addEventListener('abort', () => reject(abortError()));
      });
    })();
}

function abortError() {
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

const describeError = (err: ApiError) => `LOCALIZED(${err.status})`;

function setup(overrides: Partial<Parameters<typeof useChat>[0]> = {}) {
  return renderHook(() =>
    useChat({
      model: 'test-model',
      useHermesBridge: true,
      apiKey: 'test-key',
      describeError,
      ...overrides,
    })
  );
}

describe('useChat', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it('starts empty and idle', () => {
    const { result } = setup();

    expect(result.current.messages).toEqual([]);
    expect(result.current.streaming).toBe(false);
  });

  it('appends the user turn and an assistant placeholder immediately', async () => {
    const { result } = setup({ streamImpl: streamOf([{ content: 'hi' }]) });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('Hello');
      await Promise.resolve();
    });

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(result.current.messages[1].role).toBe('assistant');

    await act(async () => {
      await pending;
    });
  });

  it('accumulates streamed content into the last message', async () => {
    const { result } = setup({
      streamImpl: streamOf([{ content: 'Hel' }, { content: 'lo ' }, { content: 'world' }]),
    });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('Hello world');
    expect(result.current.streaming).toBe(false);
  });

  it('appends an error chunk after the text that already arrived', async () => {
    const { result } = setup({
      streamImpl: streamOf([{ content: 'partial' }, { error: 'provider exploded' }]),
    });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1].content).toBe('partial\n\n⚠️ provider exploded');
  });

  it('shows only the error when nothing was streamed before it', async () => {
    const { result } = setup({ streamImpl: streamOf([{ error: 'boom' }]) });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1].content).toBe('⚠️ boom');
  });

  it('maps an ApiError through describeError onto the placeholder', async () => {
    const { result } = setup({ streamImpl: streamOf([], new ApiError(401, null)) });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('⚠️ LOCALIZED(401)');
    expect(result.current.streaming).toBe(false);
  });

  it('surfaces a failed connection for a non-ApiError throw', async () => {
    const { result } = setup({
      streamImpl: streamOf([{ content: 'x' }], new Error('network down')),
    });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1].content).toBe(
      '⚠️ Koneksi ke backend gagal: network down'
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('keeps a partial reply when the user aborts', async () => {
    let captured: StreamChatOptions | undefined;
    const { result } = setup({
      streamImpl: (options) => {
        captured = options;
        return streamUntilAbort()(options);
      },
    });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('Hi');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('partial'));

    act(() => result.current.stop());
    await act(async () => {
      await pending;
    });

    expect(captured?.signal?.aborted).toBe(true);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('partial');
    expect(result.current.streaming).toBe(false);
  });

  it('drops the empty placeholder when aborted before any content', async () => {
    const { result } = setup({ streamImpl: streamUntilAbortAbortOnly() });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('Hi');
      await Promise.resolve();
    });

    act(() => result.current.stop());
    await act(async () => {
      await pending;
    });

    // Only the user turn survives — no empty assistant bubble left behind.
    expect(result.current.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('ignores a send while one is already streaming', async () => {
    const streamImpl = vi.fn(streamUntilAbort());
    const { result } = setup({ streamImpl });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('first');
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.send('second');
    });

    expect(streamImpl).toHaveBeenCalledTimes(1);
    expect(result.current.messages.some((m) => m.content === 'second')).toBe(false);

    act(() => result.current.stop());
    await act(async () => {
      await pending;
    });
  });

  it('ignores empty or whitespace-only input', async () => {
    const streamImpl = vi.fn(streamOf([{ content: 'x' }]));
    const { result } = setup({ streamImpl });

    await act(async () => {
      await result.current.send('   ');
    });

    expect(streamImpl).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(result.current.streaming).toBe(false);
  });

  it('sends the model, bridge flag, history and API key to the client', async () => {
    let captured: StreamChatOptions | undefined;
    const { result } = setup({
      streamImpl: (options) => {
        captured = options;
        return streamOf([{ content: 'ok' }])(options);
      },
    });

    await act(async () => {
      await result.current.send('Hello');
    });

    expect(captured?.model).toBe('test-model');
    expect(captured?.useHermesBridge).toBe(true);
    expect(captured?.apiKey).toBe('test-key');
    expect(captured?.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('writes a progress phase onto the assistant placeholder while the reply is in flight', async () => {
    // Tahap 2 item 5: while the agent works, the trailing message carries the phase so
    // MessageList can render it instead of a bare, frozen typing indicator. It has to be
    // observable *before* the answer arrives — that is the window it exists for.
    let resolveStream: () => void = () => {};
    const gate = new Promise<void>((resolve) => (resolveStream = resolve));
    const streamImpl = (): AsyncGenerator<StreamChunk> =>
      (async function* () {
        yield { status: 'Menyusun jawaban' };
        await gate;
        yield { content: 'Hi' };
      })();

    const { result } = setup({ streamImpl });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('Hi');
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.messages[1]?.status).toBe('Menyusun jawaban'));
    expect(result.current.messages[1].content).toBe('');

    resolveStream();
    await act(async () => {
      await pending;
    });
  });

  it('lets a phase arrive before any content, without creating a bubble of its own', async () => {
    // A status frame is not a turn: it must annotate the pending assistant reply rather
    // than append a new message.
    let resolveStream: () => void = () => {};
    const gate = new Promise<void>((resolve) => (resolveStream = resolve));
    const streamImpl = (options: StreamChatOptions): AsyncGenerator<StreamChunk> =>
      (async function* () {
        yield { status: 'Menyusun jawaban' };
        await gate;
        void options;
      })();

    const { result } = setup({ streamImpl });

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.send('Hi');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.messages[1]?.status).toBe('Menyusun jawaban'));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('');

    resolveStream();
    await act(async () => {
      await pending;
    });
  });

  it('clears the phase once the reply has finished, so it cannot describe a dead turn', async () => {
    // A phase asserts "still being written". Leaving it on a completed or failed reply
    // would make the UI claim the agent is working on something that already ended.
    const { result } = setup({
      streamImpl: streamOf([{ status: 'Kerja' }, { content: 'done' }]),
    });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'done' });
  });

  it('clears the phase when the reply fails', async () => {
    const { result } = setup({
      streamImpl: streamOf([{ status: 'Kerja' }], new ApiError(401, null)),
    });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1]).toEqual({
      role: 'assistant',
      content: '⚠️ LOCALIZED(401)',
    });
  });

  it('does not treat a status frame as content to display', async () => {
    // Regression guard for the one mix-up that would be visible to every user: the phase
    // leaking into the answer text.
    const { result } = setup({ streamImpl: streamOf([{ status: 'Kerja' }, { content: 'ok' }]) });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1].content).toBe('ok');
  });

  it('leaves status undefined when the backend sends no phase', async () => {
    const { result } = setup({ streamImpl: streamOf([{ content: 'ok' }]) });

    await act(async () => {
      await result.current.send('Hi');
    });

    expect(result.current.messages[1].status).toBeUndefined();
  });

  it('clear() drops the conversation', async () => {
    const { result } = setup({ streamImpl: streamOf([{ content: 'ok' }]) });

    await act(async () => {
      await result.current.send('Hi');
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => result.current.clear());
    expect(result.current.messages).toEqual([]);
  });

  it('stop() is a no-op when nothing is streaming', () => {
    const { result } = setup();

    expect(() => act(() => result.current.stop())).not.toThrow();
    expect(result.current.streaming).toBe(false);
  });

  // ─── loadMessages (session restore) ──────────────────────────
  //
  // These cover the contract App.tsx relies on to switch sessions. The hook
  // declared loadMessages in UseChatResult but did not return it, so every
  // session handler called undefined; the type error only surfaced in `tsc -b`,
  // and vitest (esbuild, no typecheck) stayed green. One assertion below would
  // have caught it.

  it('returns loadMessages', () => {
    const { result } = setup();
    expect(typeof result.current.loadMessages).toBe('function');
  });

  it('loadMessages() replaces the transcript with the loaded session', () => {
    const { result } = setup();

    act(() =>
      result.current.loadMessages([
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
      ])
    );

    expect(result.current.messages.map((m) => m.content)).toEqual(['earlier', 'reply']);
  });

  it('loadMessages([]) empties the transcript', () => {
    const { result } = setup({
      initialMessages: [{ role: 'user', content: 'stale' }],
    });

    act(() => result.current.loadMessages([]));

    expect(result.current.messages).toEqual([]);
  });

  it('send() after loadMessages() sends the loaded history plus the new turn', async () => {
    const seen: StreamChatOptions[] = [];
    const { result } = setup({
      streamImpl: (options: StreamChatOptions) => {
        seen.push(options);
        return streamOf([{ content: 'ok' }])(options);
      },
    });

    act(() => result.current.loadMessages([{ role: 'user', content: 'earlier' }]));
    await act(async () => {
      await result.current.send('now');
    });

    expect(seen[0].messages.map((m) => m.content)).toEqual(['earlier', 'now']);
  });

  it('send() forwards the current settings after they change', async () => {
    // `send` reads systemPrompt/temperature/maxTokens from its closure, so they
    // must be in its dependency list -- otherwise changing a setting without
    // touching `messages` leaves the memoized callback sending stale values.
    const seen: StreamChatOptions[] = [];
    const streamImpl = (options: StreamChatOptions) => {
      seen.push(options);
      return streamOf([{ content: 'ok' }])(options);
    };

    const { result, rerender } = renderHook(
      ({ temperature, systemPrompt }: { temperature: number; systemPrompt: string }) =>
        useChat({
          model: 'test-model',
          useHermesBridge: true,
          apiKey: '',
          temperature,
          systemPrompt,
          describeError,
          streamImpl,
        }),
      { initialProps: { temperature: 0.2, systemPrompt: '' } }
    );

    rerender({ temperature: 1.4, systemPrompt: 'Be terse.' });
    await act(async () => {
      await result.current.send('Hi');
    });

    expect(seen[0].temperature).toBe(1.4);
    expect(seen[0].messages[0]).toEqual({ role: 'system', content: 'Be terse.' });
  });

  it('continues the thread the server named on the previous turn', async () => {
    // Without this the server would open a conversation per message and the history
    // would be a wall of one-turn threads.
    const seen: (string | null | undefined)[] = [];
    const { result } = setup({
      streamImpl: (options) => {
        seen.push(options.conversationId);
        return streamOf(seen.length === 1
          ? [{ conversationId: 'conv-1' }, { content: 'ok' }]
          : [{ content: 'again' }])(options);
      },
    });

    await act(async () => { await result.current.send('first'); });
    await act(async () => { await result.current.send('second'); });

    expect(seen).toEqual([null, 'conv-1']);
  });

  it('treats a conversation id frame as metadata, not as a message', async () => {
    const { result } = setup({
      streamImpl: streamOf([{ conversationId: 'conv-7' }, { content: 'ok' }]),
    });

    await act(async () => { await result.current.send('hi'); });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('ok');
  });

  it('starts a new thread after clear()', async () => {
    const seen: (string | null | undefined)[] = [];
    const { result } = setup({
      streamImpl: (options) => {
        seen.push(options.conversationId);
        return streamOf(seen.length === 1
          ? [{ conversationId: 'conv-1' }, { content: 'ok' }]
          : [{ content: 'fresh' }])(options);
      },
    });

    await act(async () => { await result.current.send('first'); });
    act(() => { result.current.clear(); });
    await act(async () => { await result.current.send('second'); });

    expect(seen).toEqual([null, null]);
  });

  it('starts a new thread after loadMessages(), so a switched session cannot append to the old one', async () => {
    const seen: (string | null | undefined)[] = [];
    const { result } = setup({
      streamImpl: (options) => {
        seen.push(options.conversationId);
        return streamOf(seen.length === 1
          ? [{ conversationId: 'conv-1' }, { content: 'ok' }]
          : [{ content: 'loaded reply' }])(options);
      },
    });

    await act(async () => { await result.current.send('first'); });
    act(() => { result.current.loadMessages([{ role: 'user', content: 'old' }]); });
    await act(async () => { await result.current.send('next'); });

    expect(seen).toEqual([null, null]);
  });
});

/** Aborts before yielding anything, so `send` leaves no partial reply. */
function streamUntilAbortAbortOnly() {
  return (options: StreamChatOptions): AsyncGenerator<StreamChunk> =>
    (async function* () {
      await new Promise<never>((_, reject) => {
        if (options.signal?.aborted) return reject(abortError());
        options.signal?.addEventListener('abort', () => reject(abortError()));
      });
      // Unreachable: the promise above never resolves. Present so the
      // function has generator semantics.
      yield { content: '' };
    })();
}
