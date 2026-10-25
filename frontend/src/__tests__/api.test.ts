import { describe, it, expect, vi } from 'vitest';
import { parseSseBuffer, streamChat, ApiError } from '../api';
import type { StreamChunk } from '../api';

/** Build a Response whose body streams the given chunks then closes. */
function streamResponse(chunks: string[], init: { status?: number; retryAfter?: string } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  const headers = new Headers();
  if (init.retryAfter) headers.set('Retry-After', init.retryAfter);
  return new Response(body, { status: init.status ?? 200, headers });
}

async function collect(options: Parameters<typeof streamChat>[0]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of streamChat(options)) out.push(chunk);
  return out;
}

const base = { model: 'hermes', useHermesBridge: true, messages: [{ role: 'user' as const, content: 'hi' }] };

describe('parseSseBuffer', () => {
  it('extracts a complete data frame', () => {
    const { events, rest } = parseSseBuffer('data: {"content":"Hi"}\n\n');
    expect(events).toEqual([{ content: 'Hi' }]);
    expect(rest).toBe('');
  });

  it('keeps an incomplete trailing frame in rest', () => {
    const { events, rest } = parseSseBuffer('data: {"content":"Hel');
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"content":"Hel');
  });

  it('skips the [DONE] terminator', () => {
    const { events } = parseSseBuffer('data: [DONE]\n\n');
    expect(events).toEqual([]);
  });

  it('surfaces an error frame', () => {
    const { events } = parseSseBuffer('data: {"error":"provider down"}\n\n');
    expect(events).toEqual([{ error: 'provider down' }]);
  });

  it('ignores malformed JSON without dropping later frames', () => {
    const { events } = parseSseBuffer('data: {not json}\n\ndata: {"content":"ok"}\n\n');
    expect(events).toEqual([{ content: 'ok' }]);
  });

  it('ignores frames without the data prefix', () => {
    const { events } = parseSseBuffer('event: ping\n\ndata: {"content":"ok"}\n\n');
    expect(events).toEqual([{ content: 'ok' }]);
  });

  it('handles several frames in one buffer', () => {
    const { events } = parseSseBuffer('data: {"content":"a"}\n\ndata: {"content":"b"}\n\n');
    expect(events.map((e) => e.content)).toEqual(['a', 'b']);
  });

  it('surfaces a conversation id frame on its own field', () => {
    // The server names the thread it filed the turn under. It must never be mistaken
    // for assistant text, or the id would be printed into the transcript.
    const { events } = parseSseBuffer('data: {"conversationId":"0192f0aa-0000-7000-8000-000000000000"}\n\n');
    expect(events).toEqual([{ conversationId: '0192f0aa-0000-7000-8000-000000000000' }]);
  });

  it('surfaces a status frame on its own field', () => {
    // The backend announces phases as {"status":"…"} while the agent works. It must arrive
    // as a status chunk: parsed as content it would be printed into the transcript.
    const { events } = parseSseBuffer('data: {"status":"Menyusun jawaban"}\n\n');
    expect(events).toEqual([{ status: 'Menyusun jawaban' }]);
  });

  it('keeps the three frame kinds distinct', () => {
    const { events } = parseSseBuffer(
      'data: {"status":"Kerja"}\n\ndata: {"content":"hi"}\n\ndata: {"error":"boom"}\n\n'
    );
    expect(events).toEqual([{ status: 'Kerja' }, { content: 'hi' }, { error: 'boom' }]);
  });

  it('treats a status frame as a status, never as content', () => {
    // Regression guard for the exact mix-up the feature must not have: a status must never
    // land in `content`, or the phase text is appended to the assistant's answer.
    const { events } = parseSseBuffer('data: {"status":"Kerja"}\n\n');
    expect(events[0]).not.toHaveProperty('content');
  });
});

describe('streamChat', () => {
  it('yields content chunks in order across network splits', async () => {
    // "Hel" | "lo" proves a frame split mid-JSON is reassembled, not dropped.
    const fetchImpl = vi.fn(async () => streamResponse(['data: {"content":"Hel', 'lo"}\n\n']));
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ content: 'Hello' }]);
  });

  it('sends the api key header when provided, and omits it otherwise', async () => {
    const withKey = vi.fn(async () => streamResponse(['data: [DONE]\n\n']));
    await collect({ ...base, apiKey: 'secret', fetchImpl: withKey as unknown as typeof fetch });
    const init = withKey.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret');

    const noKey = vi.fn(async () => streamResponse(['data: [DONE]\n\n']));
    await collect({ ...base, fetchImpl: noKey as unknown as typeof fetch });
    const init2 = noKey.mock.calls[0][1] as RequestInit;
    expect((init2.headers as Record<string, string>)['X-Api-Key']).toBeUndefined();
  });

  it('posts the model, bridge flag and message history as JSON', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(['data: [DONE]\n\n']));
    await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'hermes',
      useHermesBridge: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('sends the conversation id only when continuing a thread', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(['data: [DONE]\n\n']));
    await collect({ ...base, conversationId: 'conv-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).conversationId).toBe('conv-1');
  });

  it('omits the conversation id rather than sending null for a new thread', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(['data: [DONE]\n\n']));
    await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect('conversationId' in JSON.parse(init.body as string)).toBe(false);
  });

  it('throws ApiError carrying the status and Retry-After on 429', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([], { status: 429, retryAfter: '42' }));
    await expect(collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      retryAfter: '42',
    });
  });

  it('throws ApiError with a null retryAfter when the header is absent', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([], { status: 401 }));
    await expect(collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(ApiError);
    const fetchImpl2 = vi.fn(async () => streamResponse([], { status: 401 }));
    await expect(collect({ ...base, fetchImpl: fetchImpl2 as unknown as typeof fetch })).rejects.toMatchObject({
      retryAfter: null,
    });
  });

  it('propagates an abort so callers can ignore it', async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn(async () => { throw abortError; });
    await expect(
      collect({ ...base, signal: controller.signal, fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('yields an error chunk mid-stream and keeps going', async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse(['data: {"content":"ok"}\n\ndata: {"error":"boom"}\n\ndata: [DONE]\n\n'])
    );
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ content: 'ok' }, { error: 'boom' }]);
  });

  it('flushes a final frame that never got its blank-line terminator', async () => {
    const fetchImpl = vi.fn(async () => streamResponse(['data: {"content":"tail"}']));
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ content: 'tail' }]);
  });

  it('yields a status chunk before any content when the backend sends one', async () => {
    // The ordering is the feature: a progress report that arrives after the answer has
    // started cannot explain the wait it was meant to explain.
    const fetchImpl = vi.fn(async () =>
      streamResponse(['data: {"status":"Menyusun jawaban"}\n\ndata: {"content":"Hi"}\n\n'])
    );
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ status: 'Menyusun jawaban' }, { content: 'Hi' }]);
  });

  it('yields a repeated status frame so the caller can decide to ignore it', async () => {
    // Deduplication is a presentation decision, so the transport passes every frame through
    // and useChat collapses the repeats. Asserting the raw stream keeps that contract pinned.
    const fetchImpl = vi.fn(async () =>
      streamResponse([
        'data: {"status":"Kerja"}\n\ndata: {"status":"Kerja"}\n\ndata: {"content":"Hi"}\n\n',
      ])
    );
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ status: 'Kerja' }, { status: 'Kerja' }, { content: 'Hi' }]);
  });

  it('decodes a multi-byte character split across two network chunks', async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode('data: {"content":"é"}\n\n');
    // Split inside the 2-byte UTF-8 sequence so only a streaming decoder survives.
    const at = full.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(full.slice(0, at));
        controller.enqueue(full.slice(at));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    const chunks = await collect({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(chunks).toEqual([{ content: 'é' }]);
  });
});
