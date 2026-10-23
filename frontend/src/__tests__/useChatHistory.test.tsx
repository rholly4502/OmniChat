import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatHistory } from '../hooks/useChatHistory';
import type { Message } from '../types';

describe('useChatHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with a default session when localStorage is empty', () => {
    const { result } = renderHook(() => useChatHistory());
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].title).toBe('Obrolan Baru');
    expect(result.current.sessions[0].messages).toEqual([]);
    expect(result.current.activeSessionId).toBe(result.current.sessions[0].id);
  });

  it('creates a new session and sets it as active', () => {
    const { result } = renderHook(() => useChatHistory());
    act(() => {
      result.current.createSession();
    });
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeSessionId).toBe(result.current.sessions[0].id);
  });

  it('updates active session messages and derives title from first user prompt', () => {
    const { result } = renderHook(() => useChatHistory());
    const messages: Message[] = [
      { role: 'user', content: 'Bagaimana cara setup Docker di VPS Ubuntu?' },
      { role: 'assistant', content: 'Berikut langkah-langkahnya...' },
    ];

    act(() => {
      result.current.updateActiveSessionMessages(messages);
    });

    const active = result.current.activeSession;
    expect(active.messages).toEqual(messages);
    expect(active.title).toContain('Bagaimana cara setup Docker');
  });

  it('switches active session with selectSession', () => {
    const { result } = renderHook(() => useChatHistory());
    let secondId = '';
    act(() => {
      const fresh = result.current.createSession();
      secondId = fresh.id;
    });

    const firstId = result.current.sessions[1].id;
    expect(result.current.activeSessionId).toBe(secondId);

    act(() => {
      result.current.selectSession(firstId);
    });
    expect(result.current.activeSessionId).toBe(firstId);
  });

  it('deletes session and ensures at least one session remains', () => {
    const { result } = renderHook(() => useChatHistory());
    const initialId = result.current.sessions[0].id;

    act(() => {
      result.current.deleteSession(initialId);
    });

    // When the only session is deleted, a fresh empty session is automatically created
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).not.toBe(initialId);
  });

  it('exports session to Markdown using a downloadable blob', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      set href(val: string) {},
      set download(val: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    const { result } = renderHook(() => useChatHistory());
    const session = result.current.sessions[0];
    session.messages = [{ role: 'user', content: 'Halo' }];

    act(() => {
      result.current.exportSessionMarkdown(session);
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    createElementSpy.mockRestore();
  });
});
