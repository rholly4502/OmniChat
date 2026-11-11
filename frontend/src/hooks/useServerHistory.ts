import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSession, ConversationUsageSummary, Message } from '../types';
import { archiveConversation, deleteConversation, deleteMessage, getConversation, getConversationUsage, listConversations, pinConversation, renameConversation, updateConversationSettings, forkConversation } from '../historyApi';
import { buildConversationCsv, buildConversationJson, buildConversationMarkdown, buildConversationPdf, downloadBlob, safeFilenameSlug, type ConversationExportFormat, type ConversationExportMeta } from '../conversationExport';

/** Title every conversation carries until the server derives one from the first prompt. */
export const NEW_SESSION_TITLE = 'Obrolan Baru';

/** The shape a guest or an empty history sees; also the initial state. */
export const EMPTY_USAGE: ConversationUsageSummary = {
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  conversationCount: 0,
  totalUpFeedback: 0,
  totalDownFeedback: 0,
  byModel: {},
};

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
  /** Narrow the list to conversations last run on this model id. */
  modelFilter?: string;
  /** Narrow the list to conversations run in this chat mode ("agent"/"direct"). */
  modeFilter?: string;
  /** Inclusive start date (ISO `yyyy-MM-dd`) for the updated-at window. */
  dateFrom?: string;
  /** Inclusive end date (ISO `yyyy-MM-dd`) for the updated-at window. */
  dateTo?: string;
  /** Debounce (ms) for automatic history-list refetches (search/filter changes). */
  listDebounceMs?: number;
  /** Injected for tests; default to the real client. */
  listImpl?: typeof listConversations;
  getImpl?: typeof getConversation;
  deleteImpl?: typeof deleteConversation;
  /** Injected for tests; default to the real client. */
  deleteMessageImpl?: typeof deleteMessage;
  /** Injected for tests; default to the real client. */
  forkImpl?: typeof forkConversation;
  renameImpl?: typeof renameConversation;
  pinImpl?: typeof pinConversation;
  /** Injected for tests; default to the real client. */
  archiveImpl?: typeof archiveConversation;
  /** Injected for tests; default to the real client. */
  updateImpl?: typeof updateConversationSettings;
  /** Injected for tests; default to the real client. */
  usageImpl?: typeof getConversationUsage;
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
  /** Delete `messageId` from the active server conversation (and everything newer). */
  deleteMessageFromActive: (messageId: string) => Promise<Message[] | null>;
  /** Duplicate `id` into a fresh thread and make the copy active. */
  forkSession: (id: string) => Promise<Message[] | null>;
  /** Rename `id`; resolves true when the server accepted the new title. */
  renameSession: (id: string, title: string) => Promise<boolean>;
  /** Pin/unpin `id`; resolves true when the server applied the state. */
  pinSession: (id: string, pinned: boolean) => Promise<boolean>;
  /** Archive/unarchive `id`; resolves true when the server applied the state. */
  archiveSession: (id: string, archived: boolean) => Promise<boolean>;
  /** Persist a model and/or mode change for the active server conversation. */
  updateActiveConversationSettings: (model?: string, mode?: string) => Promise<boolean>;
  /** Adopt the id the server assigned to the active draft, then refresh the list. */
  adoptConversation: (id: string) => void;
  /** Mirror the in-flight transcript onto the active row, so export sees it. */
  updateActiveSessionMessages: (messages: Message[]) => void;
  /** Download the session in the requested format (default Markdown). */
  exportSession: (session: ChatSession, format?: ConversationExportFormat) => void;
  /** Copy the conversation's Markdown transcript to the clipboard (resolves when written). */
  copyTranscript: (session: ChatSession) => Promise<void>;
  /** Aggregate token usage across every stored conversation (all-zero for a guest). */
  usageSummary: ConversationUsageSummary;
  /** Load the next page of older conversations and append them to the list. */
  loadMore: () => Promise<void>;
  /** True when a full page was returned, so older rows likely exist. */
  hasMore: boolean;
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
  const { apiKey, search, modelFilter, modeFilter, dateFrom, dateTo, listDebounceMs = 300, listImpl, getImpl, deleteImpl, deleteMessageImpl, renameImpl, pinImpl, archiveImpl, updateImpl, usageImpl, forkImpl } = options;
  // Starts at 2: `draft_1` is the initial state below, and reusing that id
  // would make a brand-new chat collide with the one it replaces.
  const nextDraftId = useRef(2);
  const [sessions, setSessions] = useState<ChatSession[]>(() => [draftSession('draft_1')]);
  const [activeSessionId, setActiveSessionId] = useState('draft_1');
  /** Bumped to force a refetch after the server names a draft. */
  const [reloadToken, setReloadToken] = useState(0);
  const [usageSummary, setUsageSummary] = useState<ConversationUsageSummary>(EMPTY_USAGE);
  /** Page size for the history list; older rows load on demand via {@link loadMore}. */
  const PAGE_SIZE = 50;
  /** How many newest server rows are already loaded (the offset for the next page). */
  const [listOffset, setListOffset] = useState(0);
  /** True when the last page came back full, so more rows likely exist. */
  const [hasMore, setHasMore] = useState(false);
  /** Latest filters, readable from `loadMore` without a stale closure. */
  const filtersRef = useRef({ search, modelFilter, modeFilter, dateFrom, dateTo });
  useEffect(() => {
    filtersRef.current = { search, modelFilter, modeFilter, dateFrom, dateTo };
  }, [search, modelFilter, modeFilter, dateFrom, dateTo]);

  // Injected clients are held in a ref so an inline arrow function (a new
  // identity on every render) cannot retrigger the fetch effect forever.
  const impls = useRef({ list: listImpl, get: getImpl, remove: deleteImpl, rename: renameImpl, pin: pinImpl, archive: archiveImpl, update: updateImpl, usage: usageImpl, deleteMessage: deleteMessageImpl, fork: forkImpl });
  useEffect(() => {
    impls.current = { list: listImpl, get: getImpl, remove: deleteImpl, rename: renameImpl, pin: pinImpl, archive: archiveImpl, update: updateImpl, usage: usageImpl, deleteMessage: deleteMessageImpl, fork: forkImpl };
  }, [listImpl, getImpl, deleteImpl, deleteMessageImpl, renameImpl, pinImpl, archiveImpl, updateImpl, usageImpl, forkImpl]);

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
    // Debounce the history-list fetch: typing in the search box (or nudging the
    // model/date filters) resets a short timer instead of firing a server
    // round-trip per keystroke; the fetch runs once the input settles.
    const timer = window.setTimeout(() => {
    list({ apiKey: apiKey || undefined, signal: ctrl.signal }, PAGE_SIZE, search, {
      model: modelFilter,
      mode: modeFilter,
      from: dateFrom,
      to: dateTo,
    }, 0).then((rows) => {
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
              isArchived: row.isArchived ?? false,
              promptTokens: row.promptTokens,
              completionTokens: row.completionTokens,
              totalTokens: row.totalTokens,
              model: row.model,
              mode: row.mode,
              preview: row.preview,
            };
          });
          return sortSessions([...serverRows, ...drafts]);
        });
        // The offset for the next page is the number of rows already loaded.
        setListOffset(rows.length);
        // A full page means there may be older rows; a short page means we've
        // reached the end of history under the current filter.
        setHasMore(rows.length >= PAGE_SIZE);
      })
      .catch(() => {
        if (cancelled) return;
        // Guest (401) and offline both mean "no history to show". The draft must
        // survive, so the failure is swallowed rather than rendered.
        setHasMore(false);
      });
    }, listDebounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [apiKey, search, modelFilter, modeFilter, dateFrom, dateTo, reloadToken, listDebounceMs, PAGE_SIZE]);

  // Aggregate usage is global (not affected by search/filter), so it refetches
  // only when the key changes or the server names a draft.
  useEffect(() => {
    const getUsage = impls.current.usage ?? getConversationUsage;
    const ctrl = new AbortController();
    let cancelled = false;

    getUsage({ apiKey: apiKey || undefined, signal: ctrl.signal })
      .then((summary) => {
        if (!cancelled) setUsageSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setUsageSummary(EMPTY_USAGE);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [apiKey, reloadToken]);

  /** Fetch and cache one server transcript, returning null when it cannot be read. */
  const loadTranscript = useCallback(
    async (id: string): Promise<Message[] | null> => {
      const cached = sessions.find((s) => s.id === id);
      if (cached && cached.messages.length > 0) return cached.messages;

      const get = impls.current.get ?? getConversation;
      try {
        const detail = await get(id, { apiKey: apiKey || undefined });
        const messages: Message[] = detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          id: m.id,
          feedback: m.feedback,
          // Reloaded turns keep the server's real createdAt (epoch ms), so a
          // resumed conversation shows when each message was actually sent.
          createdAt: Date.parse(m.createdAt) || undefined,
          // Reloaded turns carry their persisted usage/model, so a resumed conversation
          // keeps its per-message cost footnote instead of losing it in the reload.
          usage: m.promptTokens || m.completionTokens
            ? { promptTokens: m.promptTokens ?? 0, completionTokens: m.completionTokens ?? 0 }
            : undefined,
          model: m.model,
          reasoning: m.reasoning,
        }));
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  title: detail.title,
                  messages,
                  updatedAt: Date.parse(detail.updatedAt) || s.updatedAt,
                  promptTokens: detail.promptTokens,
                  completionTokens: detail.completionTokens,
                  totalTokens: detail.totalTokens,
                  model: detail.model,
                  mode: detail.mode,
                }
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


  /** Delete one stored turn (and everything newer), then reload the transcript. */
  const deleteMessageFromActive = useCallback(
    async (messageId: string): Promise<Message[] | null> => {
      const id = activeRef.current;
      if (!id || !isServerConversation(id)) return null;

      const del = impls.current.deleteMessage ?? deleteMessage;
      try {
        await del(id, messageId, { apiKey: apiKey || undefined });
      } catch {
        // The server still holds the turn; leaving it visible is the honest state.
        return null;
      }

      // A fresh fetch after truncation (the cache would return the stale transcript).
      const get = impls.current.get ?? getConversation;
      try {
        const detail = await get(id, { apiKey: apiKey || undefined });
        const messages: Message[] = detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          id: m.id,
          feedback: m.feedback,
          createdAt: Date.parse(m.createdAt) || undefined,
          usage: m.promptTokens || m.completionTokens
            ? { promptTokens: m.promptTokens ?? 0, completionTokens: m.completionTokens ?? 0 }
            : undefined,
          model: m.model,
          reasoning: m.reasoning,
        }));
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  messages,
                  updatedAt: Date.parse(detail.updatedAt) || s.updatedAt,
                  promptTokens: detail.promptTokens,
                  completionTokens: detail.completionTokens,
                  totalTokens: detail.totalTokens,
                }
              : s,
          ),
        );
        return messages;
      } catch {
        return null;
      }
    },
    [apiKey],
  );

  /** Duplicate `id` into a fresh thread and make the copy active. */
  const forkSession = useCallback(
    async (id: string): Promise<Message[] | null> => {
      if (!isServerConversation(id)) return null;

      const fork = impls.current.fork ?? forkConversation;
      let detail;
      try {
        detail = await fork(id, { apiKey: apiKey || undefined });
      } catch {
        // The server still holds the source; the sidebar row is left untouched.
        return null;
      }

      const messages: Message[] = detail.messages.map((m) => ({
        role: m.role,
        content: m.content,
        id: m.id,
        feedback: m.feedback,
        createdAt: Date.parse(m.createdAt) || undefined,
        usage: m.promptTokens || m.completionTokens
          ? { promptTokens: m.promptTokens ?? 0, completionTokens: m.completionTokens ?? 0 }
          : undefined,
        model: m.model,
        reasoning: m.reasoning,
      }));

      const forked: ChatSession = {
        id: detail.id,
        title: detail.title,
        messages,
        createdAt: Date.parse(detail.createdAt) || Date.now(),
        updatedAt: Date.parse(detail.updatedAt) || Date.now(),
        isPinned: false,
        isArchived: false,
        promptTokens: detail.promptTokens,
        completionTokens: detail.completionTokens,
        totalTokens: detail.totalTokens,
        model: detail.model,
        mode: detail.mode,
        preview: messages[messages.length - 1]?.content,
      };

      setSessions((prev) => sortSessions([...prev, forked]));
      setActiveSessionId(forked.id);
      return messages;
    },
    [apiKey],
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

  /** Archive or unarchive a stored conversation; updates the row state on success. */
  const archiveSession = useCallback(
    async (id: string, archived: boolean): Promise<boolean> => {
      if (!isServerConversation(id)) return false;
      const archive = impls.current.archive ?? archiveConversation;
      try {
        await archive(id, archived, { apiKey: apiKey || undefined });
      } catch {
        // The server still holds the old archive state; the row is left untouched.
        return false;
      }
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, isArchived: archived } : s)));
      return true;
    },
    [apiKey],
  );
  /** Persist a model and/or mode change for the active server conversation. */
  const updateActiveConversationSettings = useCallback(
    async (model?: string, mode?: string): Promise<boolean> => {
      const id = activeRef.current;
      if (!id || !isServerConversation(id)) return false;
      const update = impls.current.update ?? updateConversationSettings;
      try {
        await update(
          id,
          { ...(model ? { model } : {}), ...(mode ? { mode } : {}) },
          { apiKey: apiKey || undefined },
        );
      } catch {
        // The server still holds the old settings; the row is left untouched.
        return false;
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                ...(model ? { model } : {}),
                ...(mode ? { mode } : {}),
              }
            : s,
        ),
      );
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

  const exportSession = useCallback((session: ChatSession, format: ConversationExportFormat = 'markdown') => {
    const slug = safeFilenameSlug(session.title);
    // Per-conversation metadata travels with every export, so a downloaded
    // conversation is a self-contained audit record: which model/mode ran it
    // and how many tokens it consumed (used for the PDF/CSV/JSON/Markdown
    // headers, and as the source of the usage block in the text formats).
    const meta: ConversationExportMeta = {
      model: session.model,
      mode: session.mode,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
    };
    if (format === 'json') {
      const blob = new Blob([buildConversationJson(session.messages, session.title, meta)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, `${slug}.json`);
      return;
    }
    if (format === 'csv') {
      // UTF-8 BOM so Excel renders the CSV as UTF-8 rather than ANSI.
      const blob = new Blob(['\uFEFF' + buildConversationCsv(session.messages, meta)], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `${slug}.csv`);
      return;
    }
    if (format === 'pdf') {
      // buildConversationPdf is async (lazy jsPDF); trigger the download when it resolves.
      void buildConversationPdf(session.messages, session.title, meta).then((blob) =>
        downloadBlob(blob, `${slug}.pdf`),
      );
      return;
    }
    const md = buildConversationMarkdown(session.messages, session.title, meta, session.createdAt);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${slug}.md`);

  }, []);

  const copyTranscript = useCallback((session: ChatSession) => {
    const meta: ConversationExportMeta = {
      model: session.model,
      mode: session.mode,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
    };
    return navigator.clipboard.writeText(
      buildConversationMarkdown(session.messages, session.title, meta, session.createdAt),
    );
  }, []);

  /** Load the next page of older conversations and append them to the list. */
  const loadMore = useCallback(async () => {
    const { search, modelFilter, modeFilter, dateFrom, dateTo } = filtersRef.current;
    const list = impls.current.list ?? listConversations;
    const nextOffset = listOffset;
    try {
      const rows = await list(
        { apiKey: apiKey || undefined },
        PAGE_SIZE,
        search,
        { model: modelFilter, mode: modeFilter, from: dateFrom, to: dateTo },
        nextOffset,
      );
      setSessions((prev) => {
        const drafts = prev.filter((s) => !isServerConversation(s.id));
        const existingIds = new Set(prev.filter((s) => isServerConversation(s.id)).map((s) => s.id));
        const appended = rows
          .filter((row) => !existingIds.has(row.id))
          .map<ChatSession>((row) => {
            const existing = prev.find((s) => s.id === row.id);
            return {
              id: row.id,
              title: row.title,
              messages: existing?.messages ?? [],
              createdAt: Date.parse(row.createdAt) || Date.now(),
              updatedAt: Date.parse(row.updatedAt) || Date.now(),
              isPinned: row.isPinned ?? false,
              isArchived: row.isArchived ?? false,
              promptTokens: row.promptTokens,
              completionTokens: row.completionTokens,
              totalTokens: row.totalTokens,
              model: row.model,
              mode: row.mode,
              preview: row.preview,
            };
          });
        return sortSessions([...prev.filter((s) => isServerConversation(s.id)), ...appended, ...drafts]);
      });
      setListOffset(nextOffset + rows.length);
      setHasMore(rows.length >= PAGE_SIZE);
    } catch {
      // The append failed; the already-loaded rows remain, and loadMore stays
      // available for a retry.
    }
  }, [apiKey, listOffset, PAGE_SIZE]);

  return {
    sessions,
    activeSession:
 sessions.find((s) => s.id === resolvedActiveId) ?? sessions[0],
    activeSessionId: resolvedActiveId,
    createSession,
    selectSession,
    deleteSession,
    deleteMessageFromActive,
    forkSession,
    renameSession,
    pinSession,
    archiveSession,
    updateActiveConversationSettings,
    adoptConversation,
    updateActiveSessionMessages,
    exportSession,
    copyTranscript,
    usageSummary,
    loadMore,
    hasMore,
  };
}
