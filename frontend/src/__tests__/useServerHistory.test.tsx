import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { isServerConversation, useServerHistory, EMPTY_USAGE } from '../hooks/useServerHistory';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function summary(id: string, title: string, updatedAt = '2026-10-25T10:00:00+00:00', over: Partial<{ mode: string; model: string }> = {}) {
  return {
    id,
    title,
    mode: 'agent',
    model: 'hermes',
    createdAt: '2026-10-25T09:00:00+00:00',
    updatedAt,
    ...over,
  };
}

function detail(id: string, title: string, contents: string[]) {
  return {
    ...summary(id, title),
    messages: contents.map((content, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content,
      createdAt: '2026-10-25T09:00:00+00:00',
      promptTokens: i % 2 === 1 ? 12 : undefined,
      completionTokens: i % 2 === 1 ? 8 : undefined,
      model: i % 2 === 1 ? 'hermes-default' : undefined,
    })),
  };
}

const deps = (over: Partial<Parameters<typeof useServerHistory>[0]> = {}) => ({
  apiKey: 'k',
  listImpl: vi.fn().mockResolvedValue([]),
  getImpl: vi.fn(),
  deleteImpl: vi.fn().mockResolvedValue(undefined),
  deleteMessageImpl: vi.fn().mockResolvedValue(undefined),
  ...over,
});

describe('isServerConversation', () => {
  it('accepts a GUID and rejects a local draft id', () => {
    expect(isServerConversation(A)).toBe(true);
    expect(isServerConversation('draft_1')).toBe(false);
  });
});

describe('useServerHistory', () => {
  it('passes the search term through to the list call', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    renderHook(() => useServerHistory(deps({ listImpl, search: 'spotify' })));

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    expect(listImpl.mock.calls[0][1]).toBe(50);
    expect(listImpl.mock.calls[0][2]).toBe('spotify');
  });

  it('refetches when the search term changes', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(
      ({ search }) => useServerHistory(deps({ listImpl, search })),
      { initialProps: { search: 'a' } },
    );

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    rerender({ search: 'b' });
    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(2));
    expect(listImpl.mock.calls[1][2]).toBe('b');
  });

  it('forwards model and date filters to the list call', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    renderHook(() =>
      useServerHistory(
        deps({ listImpl, modelFilter: 'claude-sonnet', dateFrom: '2026-11-01', dateTo: '2026-11-30' }),
      ),
    );

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    expect(listImpl.mock.calls[0][3]).toEqual({
      model: 'claude-sonnet',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('refetches when a history filter changes', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(
      (f) => useServerHistory(deps({ listImpl, ...f })),
      { initialProps: { modelFilter: 'a' } },
    );

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    rerender({ modelFilter: 'b' });
    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(2));
    expect(listImpl.mock.calls[1][3]).toEqual({ model: 'b', from: undefined, to: undefined });
  });

  it('starts with one draft and keeps it when the server has no history', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSessionId).toBe('draft_1');
    expect(result.current.activeSession?.title).toBe('Obrolan Baru');
  });

  it('maps stored conversations into sidebar rows, keeping the draft last', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy'), summary(B, 'SQL')]);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(3));
    expect(result.current.sessions.map((s) => s.title)).toEqual(['Deploy', 'SQL', 'Obrolan Baru']);
    // Server rows carry no bodies until selected — the list endpoint has none.
    expect(result.current.sessions[0].messages).toEqual([]);
    // Mode and model follow the row so resuming can restore both the bridge selector
    // and the model id.
    expect(result.current.sessions[0].mode).toBe('agent');
    expect(result.current.sessions[0].model).toBe('hermes');
  });

  it('maps a stored conversation mode and model into the row', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Direct', '2026-10-25T10:00:00+00:00', { mode: 'direct', model: 'nvidia/nemotron-3.5-lightning:free' })]);
    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(result.current.sessions[0].mode).toBe('direct');
    expect(result.current.sessions[0].model).toBe('nvidia/nemotron-3.5-lightning:free');
  });

  it('maps a stored conversation preview onto the sidebar row', async () => {
    const listImpl = vi.fn().mockResolvedValue([
      { ...summary(A, 'Deploy'), preview: 'Ini pratinjau pesan terakhir' },
    ]);
    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(result.current.sessions[0].preview).toBe('Ini pratinjau pesan terakhir');
  });

  it('forwards the API key and refetches when it changes', async () => {
    const listImpl = vi.fn().mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ apiKey }) => useServerHistory({ apiKey, listImpl }),
      { initialProps: { apiKey: 'first' } },
    );

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    expect(listImpl.mock.calls[0][0]).toMatchObject({ apiKey: 'first' });

    rerender({ apiKey: 'second' });

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(2));
    expect(listImpl.mock.calls[1][0]).toMatchObject({ apiKey: 'second' });
    expect(result.current.sessions).toHaveLength(1);
  });

  it('survives a rejected list request, leaving a usable draft', async () => {
    const listImpl = vi.fn().mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSessionId).toBe('draft_1');
  });

  it('loads a stored transcript on selection and caches it', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let messages: unknown;
    await act(async () => {
      messages = await result.current.selectSession(A);
    });

    const list = messages as Array<Record<string, unknown>>;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ role: 'user', content: 'halo', id: 'm0' });
    expect(list[1]).toMatchObject({
      role: 'assistant',
      content: 'hai',
      id: 'm1',
      usage: { promptTokens: 12, completionTokens: 8 },
      model: 'hermes-default',
    });
    expect(list[0].createdAt).toBe(Date.parse('2026-10-25T09:00:00+00:00'));
    expect(result.current.activeSessionId).toBe(A);
    expect(getImpl).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.selectSession('draft_1');
      await result.current.selectSession(A);
    });
    // Re-selecting uses the cached transcript; no second round trip.
    expect(getImpl).toHaveBeenCalledTimes(1);
  });

  it('loads persisted per-message usage/model so resumed footnotes survive', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let messages: unknown;
    await act(async () => {
      messages = await result.current.selectSession(A);
    });

    const list = messages as Array<Record<string, unknown>>;
    const assistant = list[1];
    expect(assistant.usage).toEqual({ promptTokens: 12, completionTokens: 8 });
    expect(assistant.model).toBe('hermes-default');
    // User turns never carry usage.
    expect(list[0].usage).toBeUndefined();
    expect(list[0].model).toBeUndefined();
  });

  it('maps the server createdAt onto reloaded messages so live timestamps survive', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let messages: unknown;
    await act(async () => {
      messages = await result.current.selectSession(A);
    });

    const list = messages as Array<Record<string, unknown>>;
    // '2026-10-25T09:00:00+00:00' as epoch ms.
    expect(list[0].createdAt).toBe(Date.parse('2026-10-25T09:00:00+00:00'));
    expect(list[1].createdAt).toBe(Date.parse('2026-10-25T09:00:00+00:00'));
  });

  it('carries the stored model into sidebar rows', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(result.current.sessions[0].model).toBe('hermes');
  });

  it('adopts the transcript model when a conversation is selected', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue({
      ...detail(A, 'Deploy', ['halo']),
      model: 'claude-sonnet',
    });

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    await act(async () => {
      await result.current.selectSession(A);
    });

    expect(result.current.sessions.find((s) => s.id === A)?.model).toBe('claude-sonnet');
  });

  it('adopts the transcript mode when a conversation is selected', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue({
      ...detail(A, 'Deploy', ['halo']),
      mode: 'direct',
    });

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    await act(async () => {
      await result.current.selectSession(A);
    });

    expect(result.current.sessions.find((s) => s.id === A)?.mode).toBe('direct');
  });

  it('returns null when a transcript cannot be fetched', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let messages: unknown = 'unset';
    await act(async () => {
      messages = await result.current.selectSession(A);
    });

    expect(messages).toBeNull();
    // The id is still selected so the sidebar does not silently jump elsewhere.
    expect(result.current.activeSessionId).toBe(A);
  });

  it('drops an abandoned draft when a new chat is started', async () => {
    const { result } = renderHook(() => useServerHistory(deps()));
    await act(async () => {});

    act(() => {
      result.current.createSession();
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSessionId).not.toBe('draft_1');
  });

  it('adopts the id the server assigned to the draft and refreshes the list', async () => {
    const listImpl = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([summary(A, 'Prompt pertama')]);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl })));
    await waitFor(() => expect(listImpl).toHaveBeenCalledTimes(1));
    await act(async () => {});

    act(() => {
      result.current.adoptConversation(A);
    });

    expect(result.current.activeSessionId).toBe(A);
    // The draft is renamed locally first, then the refetch supplies the title.
    await waitFor(() => expect(result.current.sessions[0]?.title).toBe('Prompt pertama'));
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(A);
    expect(listImpl).toHaveBeenCalledTimes(2);
  });

  it('deletes a stored conversation and selects the next one', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy'), summary(B, 'SQL')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo']));
    const deleteImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl, deleteImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(3));

    // Delete the conversation the user is actually looking at.
    await act(async () => {
      await result.current.selectSession(A);
    });

    await act(async () => {
      await result.current.deleteSession(A);
    });

    expect(deleteImpl).toHaveBeenCalledWith(A, expect.objectContaining({ apiKey: 'k' }));
    expect(result.current.sessions.map((s) => s.id)).toEqual([B, 'draft_1']);
    expect(result.current.activeSessionId).toBe(B);
  });

  it('keeps a stored row when the server refuses to delete it', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const deleteImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, deleteImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let next: unknown = 'unset';
    await act(async () => {
      next = await result.current.deleteSession(A);
    });

    expect(next).toBeNull();
    expect(result.current.sessions.map((s) => s.id)).toContain(A);
  });


  it('renames a stored conversation and updates the sidebar row', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const renameImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, renameImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let ok = false;
    await act(async () => {
      ok = await result.current.renameSession(A, 'Judul baru');
    });

    expect(renameImpl).toHaveBeenCalledWith(A, 'Judul baru', expect.objectContaining({ apiKey: 'k' }));
    expect(ok).toBe(true);
    expect(result.current.sessions[0]?.title).toBe('Judul baru');
  });

  it('leaves the row untouched when the server refuses the rename', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const renameImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, renameImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let ok = true;
    await act(async () => {
      ok = await result.current.renameSession(A, 'Judul baru');
    });

    expect(ok).toBe(false);
    expect(result.current.sessions[0]?.title).toBe('Deploy');
  });

  it('refuses to rename a local draft, which has no server row', async () => {
    const renameImpl = vi.fn();
    const { result } = renderHook(() => useServerHistory(deps({ renameImpl })));
    await act(async () => {});

    let ok = true;
    await act(async () => {
      ok = await result.current.renameSession('draft_1', 'Judul baru');
    });

    expect(renameImpl).not.toHaveBeenCalled();
    expect(ok).toBe(false);
  });

  it('mirrors the live transcript onto the active row for export', async () => {
    const { result } = renderHook(() => useServerHistory(deps()));
    await act(async () => {});

    act(() => {
      result.current.updateActiveSessionMessages([{ role: 'user', content: 'halo' }]);
    });

    expect(result.current.activeSession?.messages).toEqual([{ role: 'user', content: 'halo' }]);
  });

  it('pins a stored conversation, calls the API, and updates the row', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const pinImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, pinImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let ok = false;
    await act(async () => {
      ok = await result.current.pinSession(A, true);
    });

    expect(pinImpl).toHaveBeenCalledWith(A, true, expect.objectContaining({ apiKey: 'k' }));
    expect(ok).toBe(true);
    expect(result.current.sessions[0]?.isPinned).toBe(true);
  });

  it('unpins a stored conversation', async () => {
    const alreadyPinned = { ...summary(A, 'Deploy'), isPinned: true };
    const listImpl = vi.fn().mockResolvedValue([alreadyPinned]);
    const pinImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, pinImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(result.current.sessions[0]?.isPinned).toBe(true);

    let ok = false;
    await act(async () => {
      ok = await result.current.pinSession(A, false);
    });

    expect(pinImpl).toHaveBeenCalledWith(A, false, expect.objectContaining({ apiKey: 'k' }));
    expect(ok).toBe(true);
    expect(result.current.sessions[0]?.isPinned).toBe(false);
  });

  it('sorts pinned conversations above unpinned ones', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy'), summary(B, 'SQL')]);
    const pinImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, pinImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(3));
    expect(result.current.sessions.map((s) => s.id)).toEqual([A, B, 'draft_1']);

    await act(async () => {
      await result.current.pinSession(B, true);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual([B, A, 'draft_1']);
    expect(result.current.sessions[0]?.isPinned).toBe(true);
  });

  it('leaves the row untouched when the server refuses the pin', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const pinImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, pinImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    let ok = true;
    await act(async () => {
      ok = await result.current.pinSession(A, true);
    });

    expect(ok).toBe(false);
    expect(result.current.sessions[0]?.isPinned).toBeFalsy();
  });

  it('refuses to pin a local draft, which has no server row', async () => {
    const pinImpl = vi.fn();
    const { result } = renderHook(() => useServerHistory(deps({ pinImpl })));
    await act(async () => {});

    let ok = true;
    await act(async () => {
      ok = await result.current.pinSession('draft_1', true);
    });

    expect(pinImpl).not.toHaveBeenCalled();
    expect(ok).toBe(false);
  });

  it('fetches the aggregate usage summary and exposes it', async () => {
    const usageSummary = {
      totalPromptTokens: 1100,
      totalCompletionTokens: 500,
      totalTokens: 1600,
      conversationCount: 3,
      byModel: { hermes: { promptTokens: 1100, completionTokens: 500, totalTokens: 1600 } },
    };
    const usageImpl = vi.fn().mockResolvedValue(usageSummary);
    const { result } = renderHook(() => useServerHistory(deps({ usageImpl })));

    await waitFor(() => expect(usageImpl).toHaveBeenCalledTimes(1));
    const usageArg = usageImpl.mock.calls[0][0] as { apiKey?: string; signal?: AbortSignal };
    expect(usageArg.apiKey).toBe('k');
    expect(usageArg.signal).toBeInstanceOf(AbortSignal);
    // Wait on the result (not just the call) so the state update has committed.
    await waitFor(() => expect(result.current.usageSummary).toEqual(usageSummary));
  });

  it('falls back to the all-zero summary when the usage request fails', async () => {
    const usageImpl = vi.fn().mockRejectedValue(new Error('429'));
    const { result } = renderHook(() => useServerHistory(deps({ usageImpl })));

    await waitFor(() => expect(usageImpl).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.usageSummary).toEqual({
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      conversationCount: 0,
      totalUpFeedback: 0,
      totalDownFeedback: 0,
      byModel: {},
    }));
  });

  it('persists a model change for a stored conversation and updates the row', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const updateImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, updateImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    // The active session must be the stored conversation, not the draft.
    await act(async () => {
      await result.current.selectSession(A);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.updateActiveConversationSettings('claude-sonnet');
    });

    expect(updateImpl).toHaveBeenCalledWith(
      A,
      { model: 'claude-sonnet' },
      expect.objectContaining({ apiKey: 'k' }),
    );
    expect(ok).toBe(true);
    expect(result.current.sessions.find((s) => s.id === A)?.model).toBe('claude-sonnet');
  });

  it('persists mode and model together', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const updateImpl = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, updateImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.selectSession(A);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.updateActiveConversationSettings('claude-sonnet', 'direct');
    });

    expect(updateImpl).toHaveBeenCalledWith(
      A,
      { model: 'claude-sonnet', mode: 'direct' },
      expect.objectContaining({ apiKey: 'k' }),
    );
    expect(ok).toBe(true);
    const row = result.current.sessions.find((s) => s.id === A);
    expect(row?.model).toBe('claude-sonnet');
    expect(row?.mode).toBe('direct');
  });

  it('returns false for a local draft without calling the API', async () => {
    const updateImpl = vi.fn();
    const { result } = renderHook(() => useServerHistory(deps({ updateImpl })));
    await act(async () => {});

    let ok = true;
    await act(async () => {
      ok = await result.current.updateActiveConversationSettings('claude-sonnet');
    });

    expect(updateImpl).not.toHaveBeenCalled();
    expect(ok).toBe(false);
  });

  it('leaves the row untouched when the server refuses the update', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const updateImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, updateImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.selectSession(A);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.updateActiveConversationSettings('claude-sonnet');
    });

    expect(ok).toBe(false);
    expect(result.current.sessions.find((s) => s.id === A)?.model).toBe('hermes');
  });

  it('copyTranscript writes the conversation Markdown to the clipboard', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));
    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl })));

    // The history list loads on a debounced timer, so wait for the server row
    // to land before selecting it (activeSession then resolves to it).
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.selectSession(A);
    });

    const writeSpy = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeSpy;

    await act(async () => {
      await result.current.copyTranscript(result.current.activeSession!);
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const md = writeSpy.mock.calls[0][0] as string;
    expect(md).toContain('# Deploy');
    expect(md).toContain('### Pengguna');
    expect(md).toContain('halo');
    expect(md).toContain('### Asisten');
    expect(md).toContain('hai');
  });

  it('debounces rapid search changes into a single list call', async () => {
    vi.useFakeTimers();
    try {
      const listImpl = vi.fn().mockResolvedValue([]);
      const usageImpl = vi.fn().mockResolvedValue(EMPTY_USAGE);
      const { rerender } = renderHook(
        ({ search }) => useServerHistory(deps({ listImpl, usageImpl, search, listDebounceMs: 500 })),
        { initialProps: { search: 'a' } },
      );

      // The initial fetch fires once the debounce window closes.
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(listImpl).toHaveBeenCalledTimes(1);

      // Three rapid keystrokes share one debounce window — no extra fetches yet.
      rerender({ search: 'ab' });
      rerender({ search: 'abc' });
      rerender({ search: 'abcd' });
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(listImpl).toHaveBeenCalledTimes(1);

      // Once the window closes, exactly one fetch runs for the final term.
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(listImpl).toHaveBeenCalledTimes(2);
      expect(listImpl.mock.calls[1][2]).toBe('abcd');
    } finally {
      vi.useRealTimers();
    }
  });

  it('deleteMessageFromActive calls the API and reloads the truncated transcript', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));
    const deleteMessageImpl = vi.fn().mockImplementationOnce(async () => {});
    const getImplAfter = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo']));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl, deleteMessageImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.selectSession(A);
    });
    expect(getImpl).toHaveBeenCalledTimes(1);

    getImpl.mockImplementationOnce(() => getImplAfter());

    let next: unknown = 'unset';
    await act(async () => {
      next = await result.current.deleteMessageFromActive('m1');
    });

    expect(deleteMessageImpl).toHaveBeenCalledWith(A, 'm1', expect.objectContaining({ apiKey: expect.any(String) }));
    const list = next as Array<Record<string, unknown>>;
    expect(list.map((m) => m.content)).toEqual(['halo']);
    expect(result.current.sessions.find((s) => s.id === A)?.messages).toHaveLength(1);
  });

  it('deleteMessageFromActive returns null when the delete is refused', async () => {
    const listImpl = vi.fn().mockResolvedValue([summary(A, 'Deploy')]);
    const getImpl = vi.fn().mockResolvedValue(detail(A, 'Deploy', ['halo', 'hai']));
    const deleteMessageImpl = vi.fn().mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useServerHistory(deps({ listImpl, getImpl, deleteMessageImpl })));
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.selectSession(A);
    });

    let next: unknown = 'unset';
    await act(async () => {
      next = await result.current.deleteMessageFromActive('m1');
    });

    expect(next).toBeNull();
    expect(result.current.sessions.find((s) => s.id === A)?.messages).toHaveLength(2);
  });

  it('deleteMessageFromActive ignores drafts', async () => {
    const { result } = renderHook(() => useServerHistory(deps({})));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    let next: unknown = 'unset';
    await act(async () => {
      next = await result.current.deleteMessageFromActive('anything');
    });

    expect(next).toBeNull();
    expect(result.current.activeSessionId).toBe('draft_1');
  });
});
