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
