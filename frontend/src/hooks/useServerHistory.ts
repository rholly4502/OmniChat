import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSession, Message } from '../types';
import { deleteConversation, getConversation, listConversations, pinConversation, renameConversation } from '../historyApi';

/** Title every conversation carries until the server derives one from the first prompt. */
export const NEW_SESSION_TITLE = 'Obrolan Baru';

/** Ids the server issued are GUIDs; anything else is a purely local draft. */
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` came from the history API rather than this browser. */
export function isServerConversation(id: string): boolean {
  return SERVER_ID.test(id);
}

function draftSession(id: string): ChatSession {
  const now = Date.now();
  return { id, title: NEW_SESSION_TITLE, messages: [], createdAt: now, updatedAt: now };
}

/** Options for {@link useServerHistory}. */
export interface ServerHistoryOptions {
  /** Forwarded as `X-Api-Key`; changing it refetches the list. */
  apiKey: string;
  /** Server-side title/content filter for the conversation list. */
  search?: string;
  /** Injected for tests; default to the real client. */
  listImpl?: typeof listConversations;
  getImpl?: typeof getConversation;
  deleteImpl?: typeof deleteConversation;
  renameImpl?: typeof renameConversation;
  pinImpl?: typeof pinConversation;
}

/** Session list plus the actions the sidebar and App drive. */
export interface ServerHistoryResult {
  /** Server conversations (newest first) followed by the local draft, if any. */
  sessions: ChatSession[];
  activeSession: ChatSession | undefined;
  activeSessionId: string;
  /** Draft a brand-new conversation. Never leaves the browser until the first send. */
  createSession: () => ChatSession;
  /** Make `id` active and resolve the transcript to display (null when it could not load). */
  selectSession: (id: string) => Promise<Message[] | null>;
  /** Delete `id` and resolve the transcript the caller should now show. */
  deleteSession: (id: string) => Promise<Message[] | null>;
  /** Rename `id`; resolves true when the server accepted the new title. */
  renameSession: (id: string, title: string) => Promise<boolean>;
  /** Pin/unpin `id`; resolves true when the server applied the state. */
  pinSession: (id: string, pinned: boolean) => Promise<boolean>;
  /** Adopt the id the server assigned to the active draft, then refresh the list. */
  adoptConversation: (id: string) => void;
  /** Mirror the in-flight transcript onto the active row, so export sees it. */
  updateActiveSessionMessages: (messages: Message[]) => void;
  /** Download the session as Markdown. */
  exportSessionMarkdown: (session: ChatSession) => void;
}

/**
 * History backed by the server instead of localStorage.
 *
 * The split that matters: conversations that exist on the server are owned and
 * titled by it, while a brand-new chat is a *draft* until the first streamed
 * turn comes back with a `conversationId`. A guest never sees server rows (the
 * API answers `[]`), so the sidebar simply shows the draft — a fresh session,
 * exactly what the guest mode promises.
 *
 * A failed list request is not surfaced as an error: an unauthenticated caller
 * and an offline browser both mean "no history to show", and the draft session
 * has to remain usable in either case.
 */
/** Keep server rows pinned-first (mirroring the API order), drafts last. */
function sortSessions(sessions: ChatSession[]): ChatSession[] {
  const server = sessions.filter((s) => isServerConversation(s.id));
  const drafts = sessions.filter((s) => !isServerConversation(s.id));
  const pinned = server.filter((s) => s.isPinned);
  const unpinned = server.filter((s) => !s.isPinned);
  return [...pinned, ...unpinned, ...drafts];
}

export function useServerHistory(options: ServerHistoryOptions): ServerHistoryResult {
  const { apiKey, search, listImpl, getImpl, deleteImpl, renameImpl, pinImpl } = options;
  // Starts at 2: `draft_1` is the initial state below, and reusing that id
  // would make a brand-new chat collide with the one it replaces.
  const nextDraftId = useRef(2);
  const [sessions, setSessions] = useState<ChatSession[]>(() => [draftSession('draft_1')]);
  const [activeSessionId, setActiveSessionId] = useState('draft_1');
  /** Bumped to force a refetch after the server names a draft. */
  const [reloadToken, setReloadToken] = useState(0);

  // Injected clients are held in a ref so an inline arrow function (a new
  // identity on every render) cannot retrigger the fetch effect forever.
  const impls = useRef({ list: listImpl, get: getImpl, remove: deleteImpl, rename: renameImpl, pin: pinImpl });
  useEffect(() => {
    impls.current = { list: listImpl, get: getImpl, remove: deleteImpl, rename: renameImpl, pin: pinImpl };
  }, [listImpl, getImpl, deleteImpl, renameImpl, pinImpl]);

  /**
   * The id the UI should treat as active. Derived rather than corrected in an
   * effect: a list refresh can drop the selected row, and fixing that up with
   * setState inside an effect would render the sidebar twice for no reason.
   */
  const resolvedActiveId = sessions.some((s) => s.id === activeSessionId)
    ? activeSessionId
    : sessions[0]?.id ?? '';

  const activeRef = useRef(resolvedActiveId);
  useEffect(() => {
    activeRef.current = resolvedActiveId;
  }, [resolvedActiveId]);

  // Fetch the list on mount, on key change, and after the server names a draft.
  // Cancelling on cleanup keeps a slow response from overwriting a newer one.
  useEffect(() => {
    const list = impls.current.list ?? listConversations;
    const ctrl = new AbortController();
    let cancelled = false;

    list({ apiKey: apiKey || undefined, signal: ctrl.signal }, 50, search)
      .then((rows) => {
        if (cancelled) return;
        setSessions((prev) => {
          const drafts = prev.filter((s) => !isServerConversation(s.id));
          const serverRows = rows.map<ChatSession>((row) => {
            const existing = prev.find((s) => s.id === row.id);
            return {
              id: row.id,
              title: row.title,
              // Bodies are fetched on selection; a cached transcript is kept as is.
              messages: existing?.messages ?? [],
              createdAt: Date.parse(row.createdAt) || Date.now(),
              updatedAt: Date.parse(row.updatedAt) || Date.now(),
              isPinned: row.isPinned ?? false,
            };
          });
          return sortSessions([...serverRows, ...drafts]);
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Guest (401) and offline both mean "no history to show". The draft must
        // survive, so the failure is swallowed rather than rendered.
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [apiKey, search, reloadToken]);

  /** Fetch and cache one server transcript, returning null when it cannot be read. */
  const loadTranscript = useCallback(
    async (id: string): Promise<Message[] | null> => {
      const cached = sessions.find((s) => s.id === id);
      if (cached && cached.messages.length > 0) return cached.messages;

      const get = impls.current.get ?? getConversation;
      try {
        const detail = await get(id, { apiKey: apiKey || undefined });
        const messages: Message[] = detail.messages.map((m) => ({ role: m.role, content: m.content }));
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, title: detail.title, messages, updatedAt: Date.parse(detail.updatedAt) || s.updatedAt }
              : s,
          ),
        );
        return messages;
      } catch {
        return null;
      }
    },
    [sessions, apiKey],
  );

  const selectSession = useCallback(
    async (id: string): Promise<Message[] | null> => {
      setActiveSessionId(id);
      if (!isServerConversation(id)) return sessions.find((s) => s.id === id)?.messages ?? [];
      return loadTranscript(id);
    },
    [sessions, loadTranscript],
  );

  const createSession = useCallback((): ChatSession => {
    const fresh = draftSession(`draft_${nextDraftId.current++}`);
    setSessions((prev) => [
      // An abandoned draft (never sent, never stored) would only be clutter.
      ...prev.filter((s) => isServerConversation(s.id) || s.messages.length > 0),
      fresh,
    ]);
    setActiveSessionId(fresh.id);
    return fresh;
  }, []);

  const deleteSession = useCallback(
    async (id: string): Promise<Message[] | null> => {
      if (isServerConversation(id)) {
        const remove = impls.current.remove ?? deleteConversation;
        try {
          await remove(id, { apiKey: apiKey || undefined });
        } catch {
          // The row is still on the server; dropping it locally would make it
          // reappear on the next load, so the failure is reported by returning null.
          return null;
        }
      }

      const filtered = sessions.filter((s) => s.id !== id);
      const next = filtered.length > 0 ? filtered : [draftSession(`draft_${nextDraftId.current++}`)];
      setSessions(next);

      const nextActive = next.find((s) => s.id === activeRef.current) ?? next[0];
      setActiveSessionId(nextActive.id);

      if (!isServerConversation(nextActive.id) || nextActive.messages.length > 0) {
        return nextActive.messages;
      }
      return loadTranscript(nextActive.id);
    },
    [sessions, apiKey, loadTranscript],
  );


  const renameSession = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      if (!isServerConversation(id)) return false;
      const rename = impls.current.rename ?? renameConversation;
      try {
        await rename(id, title, { apiKey: apiKey || undefined });
      } catch {
        // The server still holds the old title; the row is left untouched.
        return false;
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
      return true;
    },
    [apiKey],
  );

  /** Pin or unpin a stored conversation; re-sorts the sidebar on success. */
  const pinSession = useCallback(
    async (id: string, pinned: boolean): Promise<boolean> => {
      if (!isServerConversation(id)) return false;
      const pin = impls.current.pin ?? pinConversation;
      try {
        await pin(id, pinned, { apiKey: apiKey || undefined });
      } catch {
        // The server still holds the old pin state; the row is left untouched.
        return false;
      }
      setSessions((prev) => sortSessions(prev.map((s) => (s.id === id ? { ...s, isPinned: pinned } : s))));
      return true;
    },
    [apiKey],
  );
  const adoptConversation = useCallback((id: string) => {
    const draftId = activeRef.current;
    if (!draftId || isServerConversation(draftId)) return;

    setSessions((prev) =>
      prev.some((s) => s.id === id)
        ? prev.filter((s) => s.id !== draftId)
        : prev.map((s) => (s.id === draftId ? { ...s, id } : s)),
    );
    setActiveSessionId(id);
    // The server also holds the derived title, so pull the authoritative row.
    setReloadToken((n) => n + 1);
  }, []);

  const updateActiveSessionMessages = useCallback((messages: Message[]) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeRef.current ? { ...s, messages, updatedAt: Date.now() } : s)),
    );
  }, []);

  const exportSessionMarkdown = useCallback((session: ChatSession) => {
    const lines = [
      `# ${session.title}`,
      `*Dibuat: ${new Date(session.createdAt).toLocaleString('id-ID')}*`,
      '',
    ];

    for (const msg of session.messages) {
      const roleLabel = msg.role === 'user' ? '👤 Pengguna' : '🤖 Asisten';
      lines.push(`### ${roleLabel}`, '', msg.content, '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    sessions,
    activeSession: sessions.find((s) => s.id === resolvedActiveId) ?? sessions[0],
    activeSessionId: resolvedActiveId,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    pinSession,
    adoptConversation,
    updateActiveSessionMessages,
    exportSessionMarkdown,
  };
}
