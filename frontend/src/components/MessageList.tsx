import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { TypingIndicator } from './TypingIndicator';
import type { Message, ModelOption } from '../types';
import { chatSuggestions } from '../suggestions';
import { estimateUsd, formatTokens, formatUsd } from '../tokenCost';
import { STICK_THRESHOLD_PX } from '../hooks/useAutoScroll';

/** Format an epoch-ms message timestamp as a compact, localized clock time. */
function formatMessageTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} ${time}`;
}

/** Escape regex metacharacters so a user query is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split a message body into plain and matching segments for a case-insensitive
 * literal query. Used to inline-highlight matches inside user bubbles (plain
 * text) without touching markdown parsing for assistant replies.
 */
function splitSegments(text: string, query: string): { text: string; match: boolean }[] {
  if (!query.trim()) return [{ text, match: false }];
  const re = new RegExp(escapeRegExp(query.trim()), 'gi');
  const out: { text: string; match: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out;
}

/** Props accepted by {@link MessageList}. */
export interface MessageListProps {
  /** Conversation so far; the last entry streams in place. */
  messages: Message[];
  /** true while an assistant reply is arriving (drives `aria-busy`). */
  streaming: boolean;
  /** Catalog for the active mode, used only to label the empty state. */
  models: ModelOption[];
  /** Currently selected model id. */
  model: string;
  /** Which mode the empty state should name. */
  useAgent: boolean;
  /** Scroll container, owned by App.tsx (it drives auto-scroll). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * Re-run the last turn. Passed from the chat hook; rendered as a "Coba lagi"
   * button on the trailing assistant message when the stream is idle.
   */
  onRegenerate?: () => void;
  /**
   * Replace a user message and resend. Opens an inline editor on that bubble;
   * Save calls this with the new text.
   */
  onEditMessage?: (index: number, newContent: string) => void;
  /**
   * Persist a rating for a stored turn (admin sessions only). Receives the server
   * message id and the next rating ("up" | "down" | null to clear); resolves true
   * on success. When absent or when the message has no id, feedback stays local.
   */
  onSetFeedback?: (messageId: string, feedback: 'up' | 'down' | null) => Promise<boolean>;
  /**
   * Persist the bookmark flag for a stored turn (admin sessions only). Receives the server
   * message id and the next flag; resolves true on success. When absent or when the message
   * has no id, bookmarks stay local.
   */
  onSetBookmark?: (messageId: string, isBookmarked: boolean) => Promise<boolean>;
  /**
   * Delete one stored turn (and everything newer) from the active conversation.
   * Receives the server message id; resolves true on success. When absent or
   * when the message has no id, no delete affordance is shown.
   */
  onDeleteMessage?: (messageId: string) => Promise<boolean>;
  /** Insert a quick-start suggestion into the composer (empty state only). */
  onSelectSuggestion?: (prompt: string) => void;
  /**
   * Stable identity of the conversation being shown. When it changes the local
   * per-message UI state (feedback, copy/edit affordances, edit draft) resets,
   * so a rating or in-progress edit never leaks onto a different conversation's
   * message at the same index.
   */
  conversationKey?: string;
  /**
   * External trigger for the in-transcript search toolbar: every time this
   * value changes (e.g. a keyboard shortcut increments a counter), the search
   * toolbar opens. 0 is ignored so the default state never opens it.
   */
  searchSignal?: number;
}

/** Small, quiet action button used on message footers. */
function ActionButton({ label, activeLabel, active, onClick, icon, activeIcon }: {
  label: string;
  activeLabel?: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1 px-2 min-h-[44px] min-w-[44px] md:min-h-[28px] rounded-none text-chill-muted hover:text-chill-accent hover:bg-chill-elevated active:bg-chill-surface active:translate-y-[2px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
      aria-label={active ? activeLabel : label}
      aria-pressed={active}
    >
      {active ? (activeIcon ?? icon) : icon}
      {active && activeLabel ? <span className="text-chill-accent font-medium">{activeLabel}</span> : null}
    </button>
  );
}

/**
 * Scrollable transcript: empty state, message bubbles, markdown rendering and
 * the typing indicator (frontend decomposition step 8), plus the regenerate and
 * edit-resend actions.
 *
 * Markup and classes are unchanged from the inline JSX it replaces, so the
 * `aria-live` / `aria-busy` contract the app tests assert on is preserved.
 */
/**
 * Build a complete, machine-readable record of one turn for the "Salin sebagai
 * JSON" action. It includes the metadata the UI already tracks the model that
 * produced the reply, its token usage and estimated cost, a stored rating and
 * the server message id, whenever they are present — so the copy is a faithful
 * export of what the user sees in the footnote, not just bare content.
 */
function messageJsonRecord(m: Message, fallbackModel: string): unknown {
  return {
    role: m.role,
    content: m.content,
    ...(m.reasoning ? { reasoning: m.reasoning } : {}),
    ...(m.id ? { id: m.id } : {}),
    ...(m.model ? { model: m.model } : {}),
    ...(m.feedback ? { feedback: m.feedback } : {}),
    ...(m.usage && (m.usage.promptTokens > 0 || m.usage.completionTokens > 0)
      ? {
          usage: m.usage,
          estimatedCostUsd: estimateUsd(m.usage, m.model ?? fallbackModel),
        }
      : {}),
  };
}

export function MessageList({ messages, streaming, models, model, useAgent, scrollRef, onRegenerate, onEditMessage, onSetFeedback, onDeleteMessage, onSetBookmark, onSelectSuggestion, conversationKey, searchSignal }: MessageListProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down' | undefined>>({});
  const [bookmarked, setBookmarked] = useState<Record<number, boolean>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteArmedIndex, setDeleteArmedIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  /** Index of the assistant bubble whose "Berpikir" disclosure is expanded. */
  const [openReasoningIndex, setOpenReasoningIndex] = useState<number | null>(null);
  const [reasoningCopiedIndex, setReasoningCopiedIndex] = useState<number | null>(null);
  /** Resolved label of the model currently selected, for the typing indicator. */
  const activeModelLabel = models.find((m) => m.id === model)?.label;
  /** Resolves a model id to its label; falls back to the raw id when unknown. */
  const modelName = (id?: string): string | null =>
    !id ? null : models.find((m) => m.id === id)?.label ?? id;

  // --- In-transcript search -------------------------------------------------
  // Self-contained local state: the search toolbar highlights matches inside
  // user bubbles and lets the reader step through every matching message. It
  // is reset together with the other transient per-conversation UI state.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const matchRefs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { rows: [] as { mi: number; count: number }[], total: 0 };
    const rows: { mi: number; count: number }[] = [];
    let total = 0;
    messages.forEach((msg, mi) => {
      const c = (msg.content.toLowerCase().match(new RegExp(escapeRegExp(q), 'g')) || []).length;
      if (c > 0) { rows.push({ mi, count: c }); total += c; }
    });
    return { rows, total };
  }, [messages, query]);

  const totalMatches = matchRefs.total;
  const activeRowMi = matchRefs.rows.length > 0
    ? matchRefs.rows[Math.min(activeIdx, matchRefs.rows.length - 1)].mi
    : -1;

  const openSearch = () => { setSearchOpen(true); setActiveIdx(0); };
  const closeSearch = () => { setSearchOpen(false); setQuery(''); setActiveIdx(0); };
  const applyQuery = (value: string) => { setQuery(value); setActiveIdx(0); };
  const goPrev = () => setActiveIdx((a) => (a <= 0 ? matchRefs.rows.length - 1 : a - 1));
  const goNext = () => setActiveIdx((a) => (a >= matchRefs.rows.length - 1 ? 0 : a + 1));

  function scrollToRow(mi: number) {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-index="${mi}"]`);
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }

  useEffect(() => {
    if (searchOpen && query.trim() && activeRowMi >= 0) scrollToRow(activeRowMi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, searchOpen]);

  /**
   * The transient UI state below is keyed by message *index*, so it must be
   * scoped to the conversation that is currently shown. Without this reset, a
   * like/dislike or an open edit in one conversation would leak onto a different
   * conversation's message at the same index.
   */
  const prevConversationKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevConversationKey.current !== conversationKey) {
      prevConversationKey.current = conversationKey;
      setFeedback({});
      setBookmarked({});
      setCopiedIndex(null);
      setEditingIndex(null);
      setDraft('');
      setDeleteArmedIndex(null);
      setOpenReasoningIndex(null);
      setReasoningCopiedIndex(null);
      setSearchOpen(false);
      setQuery('');
      setActiveIdx(0);
    }
  }, [conversationKey]);

  // Open the search toolbar on an external trigger (e.g. the global keyboard
  // shortcut). A nonzero change in `searchSignal` acts as a rising edge; the
  // toolbar's own open/close state still governs thereafter.
  const prevSearchSignal = useRef(0);
  useEffect(() => {
    if (searchSignal && searchSignal !== prevSearchSignal.current) {
      prevSearchSignal.current = searchSignal;
      openSearch();
    }
  }, [searchSignal]);

  // --- Jump-to-bottom affordance -------------------------------------------
  // Track whether the reader has scrolled away from the bottom of the
  // transcript; while they have, a floating down-arrow button offers a quick
  // way back. A hidden button is a no-op, so it costs nothing when not shown.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const far = el.scrollHeight - el.scrollTop - el.clientHeight > STICK_THRESHOLD_PX;
      setAwayFromBottom(far && el.scrollHeight > el.clientHeight);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [scrollRef]);

  // Re-evaluate after messages grow so a long blocked response or a restored
  // session flips the toggle correctly even without an intervening user scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight > STICK_THRESHOLD_PX;
    setAwayFromBottom(far && el.scrollHeight > el.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, scrollRef]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {});
  };

  /** Copy a turn's reasoning text to the clipboard and flash confirmation. */
  const handleCopyReasoning = (index: number) => {
    const reasoning = messages[index]?.reasoning;
    if (!reasoning) return;
    navigator.clipboard?.writeText(reasoning).then(() => {
      setReasoningCopiedIndex(index);
      setTimeout(() => setReasoningCopiedIndex(null), 2000);
    }).catch(() => {});
  };

  const startEdit = (index: number) => {
    setDraft(messages[index].content);
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft('');
  };

  const saveEdit = (index: number) => {
    if (!draft.trim()) return;
    onEditMessage?.(index, draft);
    setEditingIndex(null);
    setDraft('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(index);
    }
  };

  const isLastMessage = (i: number) => i === messages.length - 1;

  const toggleFeedback = async (i: number, value: 'up' | 'down') => {
    const msg = messages[i];
    const current = feedback[i] ?? msg.feedback;
    const next = current === value ? undefined : value;
    setFeedback((f) => ({ ...f, [i]: next }));
    if (msg.id && onSetFeedback) {
      const ok = await onSetFeedback(msg.id, next ?? null);
      if (!ok) setFeedback((f) => ({ ...f, [i]: current }));
    }
  };

  /** Toggle the bookmark flag on a message, optimistically, rolling back on server failure. */
  const toggleBookmark = async (i: number) => {
    const msg = messages[i];
    const current = bookmarked[i] ?? msg.bookmarked ?? false;
    const next = !current;
    setBookmarked((b) => ({ ...b, [i]: next }));
    if (msg.id && onSetBookmark) {
      const ok = await onSetBookmark(msg.id, next);
      if (!ok) setBookmarked((b) => ({ ...b, [i]: current }));
    }
  };

  const handleDelete = async (i: number) => {
    const msg = messages[i];
    if (!msg.id) return;
    if (deleteArmedIndex === i) {
      const ok = await onDeleteMessage?.(msg.id);
      setDeleteArmedIndex(null);
      if (ok) setFeedback({});
      return;
    }
    setDeleteArmedIndex(i);
    // Auto-disarm after 3s unless the user confirms.
    window.setTimeout(() => setDeleteArmedIndex((cur) => (cur === i ? null : cur)), 3000);
  };

  return (
    <div ref={scrollRef} aria-busy={streaming} aria-live="polite" aria-label="Chat messages"
      className="relative flex-1 overflow-y-auto overscroll-y-contain p-3 md:p-6 space-y-3 md:space-y-4">
      {searchOpen && (
        <div role="search" className="sticky top-0 z-20 -mx-3 md:-mx-6 px-3 md:px-6 py-2 bg-chill-bg border-b border-chill-border flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true" className="text-chill-muted shrink-0"><rect x="4" y="4" width="12" height="12" /><line x1="14" y1="14" x2="20" y2="20" /></svg>
          <input
            value={query}
            onChange={(e) => applyQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            placeholder="Cari di percakapan…"
            aria-label="Cari pesan"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-base md:text-sm text-chill-text placeholder:text-chill-muted outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          />
          <span className="text-xs text-chill-muted select-none whitespace-nowrap tabular-nums" aria-live="polite" aria-label="Posisi hasil pencarian">
            {query.trim()
              ? totalMatches > 0
                ? `${activeIdx + 1} dari ${matchRefs.rows.length} pesan`
                : 'Tidak ada yang cocok'
              : ''}
          </span>
          <button
            type="button"
            onClick={goPrev}
            disabled={totalMatches === 0}
            aria-label="Sebelumnya"
            title="Sebelumnya"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={totalMatches === 0}
            aria-label="Berikutnya"
            title="Berikutnya"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Tutup pencarian"
            title="Tutup pencarian"
            className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
          {/* Decorative pixel-art terminal ornament (chill palette, hard-edged).
              Pure decoration — aria-hidden so it stays out of the a11y tree. */}
          <svg
            width="44"
            height="28"
            viewBox="0 0 44 28"
            fill="none"
            aria-hidden="true"
            className="text-chill-muted shrink-0 focus-hidden"
          >
            <rect x="2" y="4" width="40" height="20" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="9" width="3" height="3" fill="currentColor" />
            <rect x="14" y="9" width="3" height="3" fill="currentColor" opacity="0.6" />
            <rect x="20" y="9" width="3" height="3" fill="currentColor" opacity="0.35" />
            <rect x="8" y="17" width="12" height="3" fill="currentColor" opacity="0.7" />
            <rect x="22" y="16" width="4" height="4" fill="currentColor" className="text-chill-accent" />
          </svg>
          {/* Subtle easter egg — nods to Stardew Valley & Dave the Diver:
              a pixel sprout (sage) and a pixel fish (deep sea). Hover reveals a
              quiet caption. Pure decoration — aria-hidden, rect-only, never
              interactive, so it cannot affect usability or the a11y tree. */}
          <div className="group relative flex flex-col items-center focus-hidden" aria-hidden="true">
            <div className="flex items-center gap-3 text-chill-sage">
              <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden="true" className="shrink-0">
                <rect x="14" y="7" width="2" height="9" fill="currentColor" />
                <rect x="8" y="5" width="6" height="2" fill="currentColor" />
                <rect x="16" y="5" width="6" height="2" fill="currentColor" />
                <rect x="6" y="3" width="4" height="2" fill="currentColor" opacity="0.55" />
                <rect x="20" y="3" width="4" height="2" fill="currentColor" opacity="0.55" />
                <rect x="3" y="16" width="24" height="2" fill="currentColor" opacity="0.3" />
                <rect x="5" y="18" width="20" height="2" fill="currentColor" opacity="0.18" />
              </svg>
              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true" className="text-chill-deepsea shrink-0">
                <rect x="1" y="5" width="4" height="2" fill="currentColor" />
                <rect x="1" y="8" width="4" height="2" fill="currentColor" opacity="0.65" />
                <rect x="5" y="3" width="7" height="6" fill="currentColor" />
                <rect x="12" y="3" width="5" height="6" fill="currentColor" opacity="0.85" />
                <rect x="17" y="4" width="5" height="4" fill="currentColor" />
                <rect x="5" y="6" width="7" height="3" fill="currentColor" opacity="0.45" />
              </svg>
            </div>
            <span className="mt-1.5 text-xs text-chill-muted opacity-0 pixel-step-fade group-hover:opacity-100 group-focus-within:opacity-100 select-none">
              A calm pixel farm vibe
            </span>
          </div>
          {onSelectSuggestion && (
            <div className="flex flex-wrap justify-center gap-2 max-w-md" role="group" aria-label="Mulai cepat">
              {chatSuggestions(useAgent).map((sg) => (
                <button
                  key={sg.id}
                  type="button"
                  onClick={() => onSelectSuggestion(sg.prompt)}
                  className="rounded-none border-2 border-chill-border bg-chill-surface px-3 py-2 text-xs text-chill-text hover:border-chill-accent hover:text-chill-accent active:bg-chill-elevated transition min-h-[44px] pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  data-testid={`suggestion-${sg.id}`}
                >
                  {sg.label}
                </button>
              ))}
            </div>
          )}
          <div className="text-chill-muted text-sm text-center">
            Mulai chat — mode {useAgent ? 'Agent (Hermes)' : 'Direct (LLM)'} ·{' '}
            {models.find((m) => m.id === model)?.label}
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          data-msg-index={i}
          data-active={searchOpen && i === activeRowMi ? 'true' : undefined}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}${searchOpen && i === activeRowMi ? ' outline outline-2 outline-chill-accent' : ''}`}
        >
          {m.role === 'user' && editingIndex === i ? (
            /* Inline edit mode for a user turn. */
            <div className="flex flex-col items-end gap-2 w-full">
              <div className="w-full max-w-[85%] md:max-w-[75%] bg-chill-surface border-2 border-chill-accent rounded-none p-2">
                <textarea
                  autoFocus
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, i)}
                  aria-label="Edit pesan"
                  placeholder="Edit pesan…"
                  className="w-full bg-transparent text-base md:text-sm leading-relaxed outline-none resize-none text-chill-text placeholder:text-chill-muted focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="bg-chill-surface border-2 border-chill-border text-chill-text hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] rounded-none px-3 py-1.5 text-sm transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(i)}
                  disabled={!draft.trim()}
                  className="bg-chill-accent text-chill-on-accent hover:bg-chill-accent-hover active:bg-chill-accent-active disabled:opacity-40 rounded-none px-3 py-1.5 text-sm font-semibold transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70"
                >
                  Simpan & kirim
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`
                max-w-[85%] md:max-w-[75%] rounded-none px-3.5 md:px-4 py-2.5 md:py-3
                text-sm leading-relaxed break-words pixel-reveal
                ${m.role === 'user'
                  ? 'bg-chill-accent text-chill-on-accent border-2 border-chill-border'
                  : 'bg-chill-surface border-2 border-chill-border rounded-none'
                }
              `}
            >
              {m.role === 'assistant' && !m.content && !m.reasoning ? (
                <TypingIndicator status={m.status} modelLabel={activeModelLabel} />
              ) : m.role === 'assistant' ? (
                <div>
                  {m.reasoning && (
                    <div className="mb-2">
                      <button
                        type="button"
                        onClick={() => setOpenReasoningIndex((cur) => (cur === i ? null : i))}
                        aria-expanded={openReasoningIndex === i}
                        aria-controls={`reasoning-${i}`}
                        className="w-full inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-surface px-2 py-1.5 text-xs text-chill-muted hover:text-chill-accent active:bg-chill-elevated min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
                      >
                        <svg
                          width="10" height="6" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="3" strokeLinecap="square"
                          shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"
                          className={`shrink-0 transition-transform ${openReasoningIndex === i ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <span className="font-medium select-none">Berpikir</span>
                        <span className="text-chill-accent select-none">·</span>
                        <span className="truncate max-w-[38ch] opacity-80 select-none">{m.reasoning.trim()}</span>
                      </button>
                      {openReasoningIndex === i && (
                        <div
                          id={`reasoning-${i}`}
                          className="mt-1 rounded-none border border-chill-border bg-chill-bg px-2.5 py-2 text-xs leading-relaxed text-chill-text whitespace-pre-wrap pixel-reveal"
                        >
                          {m.reasoning}
                          <div className="mt-1.5 pt-1.5 border-t border-chill-border flex justify-end">
                            <ActionButton
                              label="Salin cara berpikir"
                              activeLabel="Cara berpikir tersalin"
                              active={reasoningCopiedIndex === i}
                              onClick={() => handleCopyReasoning(i)}
                              icon={
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><rect x="9" y="9" width="13" height="13" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              }
                              activeIcon={
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="md-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
                        img: (props) => <img {...props} loading="lazy" decoding="async" />,
                        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                      }}
                    >{m.content}</ReactMarkdown>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-chill-border flex items-center justify-between text-xs text-chill-muted select-none">
                    <div className="flex items-center gap-0.5">
                      {m.createdAt && (
                        <span className="focus-hidden" aria-label={`Dikirim ${formatMessageTime(m.createdAt)}`}>
                          {formatMessageTime(m.createdAt)}
                        </span>
                      )}
<ActionButton
                        label="Tandai pesan"
                        activeLabel="Ditandai"
                        active={bookmarked[i] ?? m.bookmarked ?? false}
                        onClick={() => { void toggleBookmark(i); }}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
                        }
                        activeIcon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-chill-accent"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
                        }
                      />
                      <ActionButton
                        label="Suka"
                        activeLabel="Disukai"
                        active={(feedback[i] ?? m.feedback) === 'up'}
                        onClick={() => { void toggleFeedback(i, 'up'); }}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                        }
                      />
                      <ActionButton
                        label="Tidak suka"
                        activeLabel="Tidak disukai"
                        active={(feedback[i] ?? m.feedback) === 'down'}
                        onClick={() => { void toggleFeedback(i, 'down'); }}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                        }
                      />
                      <span className="focus-hidden">OmniChat</span>
                      {m.role === 'assistant' && m.model && (
                        <span
                          className="focus-hidden"
                          title={`Model: ${modelName(m.model)}`}
                          aria-label={`Model: ${modelName(m.model)}`}
                        >
                          · {modelName(m.model)}
                        </span>
                      )}
                      {m.usage && (m.usage.promptTokens > 0 || m.usage.completionTokens > 0) && (
                        <span className="focus-hidden" title={`${formatTokens(m.usage.promptTokens)} in · ${formatTokens(m.usage.completionTokens)} out`}>
                          · {formatTokens(m.usage.promptTokens + m.usage.completionTokens)} tok ≈ {formatUsd(estimateUsd(m.usage, m.model ?? model))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      {isLastMessage(i) && !streaming && onRegenerate && (
                        <ActionButton
                          label="Coba lagi"
                          onClick={onRegenerate}
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /></svg>
                          }
                        />
                      )}
                      {m.id && onDeleteMessage && (
                        <ActionButton
                          label="Hapus pesan"
                          activeLabel="Yakin hapus?"
                          active={deleteArmedIndex === i}
                          onClick={() => { void handleDelete(i); }}
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                          }
                          activeIcon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                          }
                        />
                      )}
                      <ActionButton
                        label="Salin sebagai JSON"
                        activeLabel="JSON tersalin"
                        active={copiedIndex === i}
                        onClick={() => handleCopy(JSON.stringify(messageJsonRecord(m, model), null, 2), i)}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1" /><path d="M8 5h8v4H8z" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="16" x2="13" y2="16" /></svg>
                        }
                      />
                      <ActionButton
                        label="Salin pesan"
                        activeLabel="Pesan tersalin"
                        active={copiedIndex === i}
                        onClick={() => handleCopy(m.content, i)}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><rect x="9" y="9" width="13" height="13" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        }
                        activeIcon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="whitespace-pre-wrap">
                    {query.trim()
                      ? splitSegments(m.content, query).map((seg, k) =>
                          seg.match ? (
                            <mark key={k} className="bg-chill-bg text-chill-accent px-0.5 box-decoration-clone">{seg.text}</mark>
                          ) : (
                            seg.text
                          ),
                        )
                      : m.content}
                  </span>
                  <div className="mt-2 pt-1.5 border-t border-chill-border flex items-center justify-between text-xs text-chill-muted select-none">
                      <div className="flex items-center gap-0.5">
                        {m.createdAt && (
                          <span className="focus-hidden" aria-label={`Dikirim ${formatMessageTime(m.createdAt)}`}>
                            {formatMessageTime(m.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center">
<ActionButton
                        label="Tandai pesan"
                        activeLabel="Ditandai"
                        active={bookmarked[i] ?? m.bookmarked ?? false}
                        onClick={() => { void toggleBookmark(i); }}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
                        }
                        activeIcon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-chill-accent"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
                        }
                      />
                        {onEditMessage && (
                          <ActionButton
                            label="Edit pesan"
                            onClick={() => startEdit(i)}
                            icon={
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            }
                          />
                        )}
                        {m.id && onDeleteMessage && (
                          <ActionButton
                            label="Hapus pesan"
                            activeLabel="Yakin hapus?"
                            active={deleteArmedIndex === i}
                            onClick={() => { void handleDelete(i); }}
                            icon={
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                            }
                            activeIcon={
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                            }
                          />
                        )}
                        <ActionButton
                          label="Salin sebagai JSON"
                          activeLabel="JSON tersalin"
                          active={copiedIndex === i}
                          onClick={() => handleCopy(JSON.stringify(messageJsonRecord(m, model), null, 2), i)}
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1" /><path d="M8 5h8v4H8z" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="16" x2="13" y2="16" /></svg>
                          }
                        />
                        <ActionButton
                          label="Salin pesan"
                          activeLabel="Pesan tersalin"
                          active={copiedIndex === i}
                          onClick={() => handleCopy(m.content, i)}
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><rect x="9" y="9" width="13" height="13" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                          }
                          activeIcon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                          }
                        />
                      </div>
                    </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {awayFromBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Lompat ke bawah"
          title="Lompat ke bawah"
          className="absolute bottom-3 right-3 z-10 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-none border-2 border-chill-border bg-chill-elevated text-chill-accent pixel-shadow hover:bg-chill-accent hover:text-chill-on-accent active:bg-chill-accent-active active:translate-y-[2px] active:shadow-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
      {!searchOpen && (
        <button
          type="button"
          onClick={openSearch}
          aria-label="Cari di percakapan"
          title="Cari di percakapan"
          className="absolute top-3 right-3 z-10 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-none border-2 border-chill-border bg-chill-elevated text-chill-muted hover:text-chill-accent hover:bg-chill-surface active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><rect x="4" y="4" width="12" height="12" /><line x1="14" y1="14" x2="20" y2="20" /></svg>
        </button>
      )}
    </div>
  );
}
