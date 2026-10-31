import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { isServerConversation, useServerHistory } from '../hooks/useServerHistory';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function summary(id: string, title: string, updatedAt = '2026-10-25T10:00:00+00:00') {
  return {
    id,
    title,
    mode: 'agent',
    model: 'hermes',
    createdAt: '2026-10-25T09:00:00+00:00',
    updatedAt,
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
    })),
  };
}

const deps = (over: Partial<Parameters<typeof useServerHistory>[0]> = {}) => ({
  apiKey: 'k',
  listImpl: vi.fn().mockResolvedValue([]),
  getImpl: vi.fn(),
  deleteImpl: vi.fn().mockResolvedValue(undefined),
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

    expect(messages).toEqual([
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'hai' },
    ]);
    expect(result.current.activeSessionId).toBe(A);
    expect(getImpl).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.selectSession('draft_1');
      await result.current.selectSession(A);
    });
    // Re-selecting uses the cached transcript; no second round trip.
    expect(getImpl).toHaveBeenCalledTimes(1);
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
});
