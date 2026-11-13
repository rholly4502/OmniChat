import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { isServerConversation } from '../hooks/useServerHistory';
import { groupSessionsByDate } from '../sessionGroups';
import { BotIcon, BoltIcon, ChillIcon, LockIcon, UnlockIcon } from './Icons';
import { HistoryFilters } from './HistoryFilters';
import { ChatStatsDialog } from './ChatStatsDialog';
import { estimateUsd, formatTokens, formatUsd, sortModelEntriesByCost } from '../tokenCost';
import type { ChatSession, ChatSettings, ConversationUsageSummary, ModelOption } from '../types';
import { EXPORT_FORMAT_LABELS, type ConversationExportFormat } from '../conversationExport';
import { BackendStatus } from './BackendStatus';
import type { ApiStatus } from '../hooks/useApiHealth';

/** Props accepted by {@link Sidebar}. */
export interface SidebarProps {
  /** The `<aside>` element; the drawer hook transforms and measures it. */
  sidebarRef: RefObject<HTMLElement | null>;
  /** true while the mobile drawer is on screen. */
  open: boolean;
  /** Close the drawer (close button and backdrop). */
  onClose: () => void;
  /** Receives focus when the drawer opens. */
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Flip the mode and reset the model to that mode's first entry. */
  onToggleMode: () => void;
  /** Catalog for the active mode. */
  models: ModelOption[];
  /**
   * Model list for the history filter dropdown. Defaults to `models`; used to
   * offer every model a conversation could have run on (agent + direct), not
   * just the active mode's catalog.
   */
  historyModels?: ModelOption[];
  /** Selected model id. */
  model: string;
  /** Model selection handler. */
  onModelChange: (id: string) => void;
  /** Backend API key, persisted to localStorage by App.tsx. */
  apiKey: string;
  /** API key change handler. */
  onApiKeyChange: (value: string) => void;
  /** Clears the stored credential and returns to the login screen. */
  onLogout: () => void;
  /** Drop the conversation. */
  onClear: () => void;
  /** List of chat sessions for history. */
  sessions?: ChatSession[];
  /** Server-side history filter term; empty means no filtering. */
  search?: string;
  /** Change the history filter term. */
  onSearchChange?: (term: string) => void;
  /** Selected model-id filter for history ("" = all models). */
  modelFilter?: string;
  /** Change the model-id history filter. */
  onModelFilterChange?: (model: string) => void;
  /** Selected chat-mode filter for history ("" = all modes). */
  modeFilter?: string;
  /** Change the chat-mode history filter. */
  onModeFilterChange?: (mode: string) => void;
  /** Inclusive start date (ISO yyyy-MM-dd) for history. */
  dateFrom?: string;
  /** Inclusive end date (ISO yyyy-MM-dd) for history. */
  dateTo?: string;
  /** Change the start-date history filter. */
  onDateFromChange?: (date: string) => void;
  /** Change the end-date history filter. */
  onDateToChange?: (date: string) => void;
  /** Currently active session ID. */
  activeSessionId?: string;
  /** Create a new session. */
  onNewSession?: () => void;
  /** Select a session. */
  onSelectSession?: (id: string) => void;
  /** Delete a session. */
  onDeleteSession?: (id: string) => void;
  /** Rename a session; resolves when the server accepts the new title. */
  onRenameSession?: (id: string, title: string) => Promise<boolean>;
  /** Pin/unpin a session; resolves when the server applies the state. */
  onPinSession?: (id: string, pinned: boolean) => Promise<boolean>;
  /** Archive/unarchive a server conversation. */
  onArchiveSession?: (id: string, archived: boolean) => Promise<boolean>;
  /** Duplicate a server conversation into a fresh thread. */
  onForkSession?: (id: string) => void | Promise<boolean>;
  /** Show archived conversations in the history list. */
  showArchived?: boolean;
  /** Toggle the archived-conversation visibility. */
  onToggleShowArchived?: () => void;
  /** Export a session in the requested format (default Markdown). */
  onExportSession?: (session: ChatSession, format?: ConversationExportFormat) => void;
  /** Copy a session's transcript (Markdown) to the clipboard. */
  onCopySession?: (session: ChatSession) => void | Promise<void>;
  /** Load the next page of older conversations. Called from the sidebar footer. */
  onLoadMore?: () => void;
  /** True when more older conversations exist under the current filter. */
  hasMore?: boolean;
  /** Optional LLM sampling settings and system prompt. */
  settings?: ChatSettings;
  /** System prompt change handler. */
  onSystemPromptChange?: (prompt: string) => void;
  /** Reset the persona/sampling params to defaults. */
  onResetPersona?: () => void;
  /** Temperature change handler. */
  onTemperatureChange?: (temp: number) => void;
  /** Max tokens change handler. */
  onMaxTokensChange?: (tokens: number) => void;
  /** Dim, calm night palette (Mode Malam). */
  nightMode?: boolean;
  /** Toggle night mode. */
  onNightModeChange?: (enabled: boolean) => void;
  /** Focus mode: hides decorative/telemetry chrome for a minimal calm surface. */
  focusMode?: boolean;
  /** Toggle focus mode. */
  onFocusModeChange?: (enabled: boolean) => void;
  /** Chill Mode: a relaxed, informal persona preset (persona santai). */
  chillMode?: boolean;
  /** Toggle Chill Mode. */
  onChillModeChange?: (enabled: boolean) => void;
  /** Active top-level view ('chat' or 'expenses'). */
  activeView?: 'chat' | 'expenses' | 'jobs' | 'events';
  /** Switch the active top-level view. */
  onSelectView?: (view: 'chat' | 'expenses' | 'jobs' | 'events') => void;
  /** Aggregate token usage across every stored conversation (all-zero for a guest). */
  usageSummary?: ConversationUsageSummary;
  /** Open the per-conversation audit dialog (message-level token/cost table). */
  onOpenAudit?: () => void;
  /** Backend reachability, shown as a quiet note at the sidebar foot. */
  backendStatus?: ApiStatus;
}

/**
 * Settings drawer: branding, session history, mode toggle, model selector, API key,
 * parameter controls, and Clear chat.
 */
export function Sidebar({
  sidebarRef,
  open,
  onClose,
  closeButtonRef,
  useAgent,
  onToggleMode,
  models,
  model,
  onModelChange,
  historyModels,
  apiKey,
  onApiKeyChange,
  onLogout,
  onClear,
  sessions,
  search = '',
  onSearchChange,
  modelFilter = '',
  onModelFilterChange,
  modeFilter = '',
  onModeFilterChange,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onForkSession,
  showArchived = false,
  onToggleShowArchived,
  onExportSession,
  onCopySession,
  onLoadMore,
  hasMore = false,
  settings,
  onSystemPromptChange,
  onResetPersona,
  onTemperatureChange,
  onMaxTokensChange,
  nightMode = false,
  onNightModeChange,
  focusMode = false,
  onFocusModeChange,
  chillMode = false,
  onChillModeChange,
  activeView = 'chat',
  onSelectView = () => {},
  usageSummary,
  onOpenAudit,
  backendStatus = 'checking',
}: SidebarProps) {
  // Two-step delete: tapping the bin only arms the row; the session is removed
  // when the user confirms. A 44px bin sits next to the session label, so a
  // single mistap used to destroy a whole conversation with no undo.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  /** Two-step clear: arming the "Clear chat" button shows an inline confirm row, so a
   * single mistap cannot wipe a whole conversation (same no-undo ruling as delete). */
  const [pendingClear, setPendingClear] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const hasActiveFilters = Boolean(modelFilter || modeFilter || dateFrom || dateTo);
  const usage = usageSummary ?? { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, conversationCount: 0, totalUpFeedback: 0, totalDownFeedback: 0, byModel: {} };
  const byModelEntries = sortModelEntriesByCost(Object.entries(usage.byModel));
  const totalUsd = byModelEntries.reduce(
    (acc, [id, u]) => acc + estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, id),
    0,
  );

  const [exportMenuFor, setExportMenuFor] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  // View-switcher tabs (role="tab"): WAI-ARIA tabs pattern - only the selected
  // tab is in the tab order, and ArrowLeft/Right/Home/End move focus + selection.
  const VIEW_TABS = ['chat', 'expenses', 'jobs', 'events'] as const;
  const viewTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleViewSwitcherKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const idx = VIEW_TABS.indexOf(activeView);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % VIEW_TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = VIEW_TABS.length - 1;
    else return;
    e.preventDefault();
    onSelectView(VIEW_TABS[next]);
    viewTabRefs.current[next]?.focus();
  };

  /** Close the export format menu when clicking elsewhere or pressing Escape. */
  useEffect(() => {
    if (!exportMenuFor) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setExportMenuFor(null);
        return;
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuFor(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [exportMenuFor]);

  return (
    <aside
      ref={sidebarRef}
      id="chat-sidebar"
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label="Chat settings"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      className={`
        fixed md:static inset-y-0 left-0 z-50
        w-[85vw] max-w-[18rem] border-r border-chill-border px-4 flex flex-col gap-4 overflow-y-auto overscroll-y-contain
        bg-chill-bg
        transform transition-transform duration-300 ease-out will-change-transform
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-chill-accent pixel-heading">OmniChat</h1>
          <p className="text-xs text-chill-muted">Hybrid AI Dashboard · .NET 10</p>
        </div>
        {/* Close button (mobile only) */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="md:hidden text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Top-level view switcher: 2x2 square grid. Chat & Pengeluaran on the
          first row; Lowongan on the second row. The fourth cell is a reserved
          placeholder that does nothing for now. */}
      <div className="grid grid-cols-2 gap-1 rounded-none bg-chill-surface border border-chill-border p-1" role="tablist" aria-label="Pilih tampilan" onKeyDown={handleViewSwitcherKeyDown}>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'chat'}
          tabIndex={activeView === 'chat' ? 0 : -1}
          onClick={() => onSelectView('chat')}
          ref={(el) => { viewTabRefs.current[0] = el; }}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 border-l-2 ${
            activeView === 'chat'
              ? 'bg-chill-elevated text-chill-text pixel-shadow-sm active:translate-y-[3px] active:shadow-none border-chill-accent'
              : 'text-chill-muted hover:bg-chill-elevated hover:text-chill-accent active:bg-chill-elevated active:text-chill-accent active:translate-y-[2px] border-transparent'
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'expenses'}
          tabIndex={activeView === 'expenses' ? 0 : -1}
          onClick={() => onSelectView('expenses')}
          ref={(el) => { viewTabRefs.current[1] = el; }}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 border-l-2 ${
            activeView === 'expenses'
              ? 'bg-chill-elevated text-chill-text pixel-shadow-sm active:translate-y-[3px] active:shadow-none border-chill-accent'
              : 'text-chill-muted hover:bg-chill-elevated hover:text-chill-accent active:bg-chill-elevated active:text-chill-accent active:translate-y-[2px] border-transparent'
          }`}
        >
          Pengeluaran
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'jobs'}
          tabIndex={activeView === 'jobs' ? 0 : -1}
          onClick={() => onSelectView('jobs')}
          ref={(el) => { viewTabRefs.current[2] = el; }}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 border-l-2 ${
            activeView === 'jobs'
              ? 'bg-chill-elevated text-chill-text pixel-shadow-sm active:translate-y-[3px] active:shadow-none border-chill-accent'
              : 'text-chill-muted hover:bg-chill-elevated hover:text-chill-accent active:bg-chill-elevated active:text-chill-accent active:translate-y-[2px] border-transparent'
          }`}
        >
          Lowongan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'events'}
          tabIndex={activeView === 'events' ? 0 : -1}
          onClick={() => onSelectView('events')}
          ref={(el) => { viewTabRefs.current[3] = el; }}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 border-l-2 ${
            activeView === 'events'
              ? 'bg-chill-elevated text-chill-text pixel-shadow-sm active:translate-y-[3px] active:shadow-none border-chill-accent'
              : 'text-chill-muted hover:bg-chill-elevated hover:text-chill-accent active:bg-chill-elevated active:text-chill-accent active:translate-y-[2px] border-transparent'
          }`}
        >
          Event
        </button>
      </div>

      {/* New Chat Button */}
      {onNewSession && (
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 bg-chill-accent hover:bg-chill-accent-hover active:bg-chill-accent-active active:translate-y-[3px] active:shadow-none text-chill-on-accent font-medium py-2 px-3 rounded-none text-sm transition pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Chat Baru
        </button>
      )}

      {/* History search — filters the server-side conversation list by title or content. */}
      {onSearchChange && (
        <div className="space-y-3">
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="square"
              shapeRendering="crispEdges"
              strokeLinejoin="miter"
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-chill-muted"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari percakapan…"
              aria-label="Cari percakapan"
              className="w-full bg-chill-surface border border-chill-border pl-8 pr-2 py-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] pixel-shadow-sm"
            />
          </div>
          <HistoryFilters
            models={historyModels ?? models}
            modelFilter={modelFilter}
            onModelFilterChange={onModelFilterChange ?? (() => {})}
            modeFilter={modeFilter}
            onModeFilterChange={onModeFilterChange ?? (() => {})}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={onDateFromChange ?? (() => {})}
            onDateToChange={onDateToChange ?? (() => {})}
          />
        </div>
      )}

      {onToggleShowArchived && (
        <button
          type="button"
          onClick={onToggleShowArchived}
          aria-pressed={showArchived}
          aria-label={showArchived ? 'Sembunyikan arsip' : 'Tampilkan arsip'}
          className="w-full flex items-center gap-2 min-h-[44px] rounded-none px-1 text-xs text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        >
          <span className={`inline-flex items-center justify-center w-4 h-4 border-2 border-chill-accent/60 ${showArchived ? 'bg-chill-accent' : 'bg-transparent'}`}>
            {showArchived && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-chill-on-accent)" strokeWidth="3.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            )}
          </span>
          {showArchived ? 'Arsip terlihat' : 'Tampilkan arsip'}
        </button>
      )}

      {/* Sessions History List */}
      {sessions && (sessions.length > 0 || search || hasActiveFilters) && (
        <div className="space-y-1">
          <div className="text-xs text-chill-muted font-medium px-1 flex items-center justify-between">
            <span>Riwayat Sesi</span>
            <span className="text-xs text-chill-muted">{sessions.length} sesi</span>
          </div>
          {sessions.length === 0 && (search || hasActiveFilters) && (
            <div className="px-1 text-sm text-chill-muted py-2">Tidak ada hasil untuk {search ? `“${search}”` : 'filter ini'}.</div>
          )}
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1 overscroll-y-contain">
            {groupSessionsByDate(showArchived ? sessions : sessions.filter((s) => !s.isArchived)).map((group) => (
              <div key={group.key} className="space-y-1">
                {group.label && (
                  <div className="text-xs text-chill-muted font-medium px-1 pt-1 select-none">{group.label}</div>
                )}
                {group.sessions.map((s) => {
                  const isActive = s.id === activeSessionId;
                  const modelLabel = (historyModels ?? models)?.find((m) => m.id === s.model)?.label ?? s.model;
              return (
                <div
                  key={s.id}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && pendingDeleteId === s.id) {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                    }
                  }}
                  className={`group flex items-center justify-between gap-0.5 pl-1 pr-0.5 rounded-none text-sm transition min-h-[44px] ${
                    isActive
                      ? 'bg-chill-elevated text-chill-accent font-medium border border-chill-accent/40'
                      : 'text-chill-text hover:bg-chill-surface hover:text-chill-accent border border-transparent'
                  }`}
                >
                  {pendingDeleteId === s.id ? (
                    <div className="flex flex-1 min-w-0 items-center justify-between gap-1 pl-2">
                      <span className="truncate text-sm text-chill-text">Hapus sesi ini?</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          autoFocus
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(null);
                          }}
                          aria-label={`Batal hapus ${s.title}`}
                          className="min-h-[44px] min-w-[52px] rounded-none border-2 border-chill-border px-2 text-sm text-chill-text transition hover:bg-chill-surface hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(null);
                            onDeleteSession?.(s.id);
                          }}
                          aria-label={`Konfirmasi hapus ${s.title}`}
                          className="min-h-[44px] min-w-[52px] rounded-none bg-chill-red text-chill-on-red px-2 text-sm font-medium transition hover:bg-chill-red-hover active:bg-chill-red-active active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ) : (
                  <>
                  {renamingId === s.id ? (
                    <form
                      className="flex flex-1 min-w-0 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = renameDraft.trim();
                        if (!trimmed) return;
                        onRenameSession?.(s.id, trimmed).then((ok) => {
                          if (ok) setRenamingId(null);
                        });
                      }}
                    >
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setRenamingId(null);
                          }
                        }}
                        aria-label={`Judul baru untuk ${s.title}`}
                        className="min-w-0 flex-1 bg-chill-surface border border-chill-border px-2 py-1 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
                      />
                      <button
                        type="submit"
                        aria-label={`Simpan nama ${s.title}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-none transition hover:text-chill-accent hover:bg-chill-surface active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                    </form>
                  ) : (
                  <button
                    type="button"
                    onClick={() => onSelectSession?.(s.id)}
                    aria-current={isActive ? 'true' : undefined}
                    title={s.title}
                    className="flex flex-col items-start justify-center text-left flex-1 min-w-0 min-h-[44px] cursor-pointer rounded-none transition active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  >
                    <span className="w-full flex items-center gap-1.5 min-w-0">
                      <span className="truncate flex-1 min-w-0">{s.title}</span>
                      {s.model && (
                        <span
                          aria-hidden="true"
                          className="shrink-0 inline-flex items-center gap-1 text-xs leading-none text-chill-muted rounded-none border border-chill-border bg-chill-surface pl-[3px] pr-1 py-0.5 select-none"
                          title={`Model: ${modelLabel}`}
                        >
                          {s.mode !== 'direct' ? <BotIcon size={11} /> : <BoltIcon size={11} />}
                          <span className="max-w-[9ch] truncate">{modelLabel}</span>
                        </span>
                      )}
                      {typeof s.totalTokens === 'number' && s.totalTokens > 0 && (() => {
                        const total = s.totalTokens ?? 0;
                        const cost = s.model
                          ? formatUsd(estimateUsd({ promptTokens: s.promptTokens ?? 0, completionTokens: s.completionTokens ?? 0 }, s.model))
                          : '';
                        return (
                          <span
                            className="shrink-0 text-xs leading-none text-chill-muted"
                            aria-label={`${formatTokens(total)} token${cost ? `, perkiraan biaya ${cost}` : ''}`}
                          >
                            <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span> {formatTokens(total)}
                            {cost ? ` · ≈${cost}` : ''}
                          </span>
                        );
                      })()}
                    </span>
                    {s.preview && (
                      <span
                        className="w-full truncate text-xs leading-tight text-chill-muted select-none mt-0.5 pr-1.5"
                        title={s.preview}
                      >
                        {s.preview}
                      </span>
                    )}
                  </button>
                  )}
                  <div className="flex items-center gap-0.5 opacity-100 md:opacity-70 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    {onExportSession && s.messages.length > 0 && (
                      <div className="relative" ref={exportMenuFor === s.id ? exportMenuRef : undefined}>
                        <button
                          type="button"
                          title="Ekspor percakapan"
                          aria-label={`Ekspor ${s.title}`}
                          aria-haspopup="menu"
                          aria-expanded={exportMenuFor === s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExportMenuFor(exportMenuFor === s.id ? null : s.id);
                          }}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-accent active:bg-chill-elevated rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        </button>
                        {exportMenuFor === s.id && (
                          <div
                            role="menu"
                            aria-label={`Format ekspor ${s.title}`}
                            className="absolute right-0 top-full z-30 mt-1 w-40 bg-chill-elevated border-2 border-chill-border pixel-shadow pixel-reveal"
                          >
                            {onCopySession && (
                              <>
                                <button
                                  key="copy"
                                  type="button"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExportMenuFor(null);
                                    void onCopySession(s);
                                  }}
                                  className="rounded-none block w-full text-left px-3 min-h-[44px] text-sm text-chill-text transition-colors hover:bg-chill-surface active:bg-chill-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                                >
                                  Salin (Markdown)
                                </button>
                                <div role="separator" className="border-t border-chill-border" />
                              </>
                            )}
                            {(Object.keys(EXPORT_FORMAT_LABELS) as ConversationExportFormat[]).map((fmt) => (
                              <button
                                key={fmt}
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExportMenuFor(null);
                                  onExportSession(s, fmt);
                                }}
                                className="rounded-none block w-full text-left px-3 min-h-[44px] text-sm text-chill-text transition-colors hover:bg-chill-surface active:bg-chill-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                              >
                                {EXPORT_FORMAT_LABELS[fmt]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}{onPinSession && isServerConversation(s.id) && (
                      <button
                        type="button"
                        title={s.isPinned ? 'Lepas sematan' : 'Sematkan'}
                        aria-label={`${s.isPinned ? 'Lepas sematan' : 'Sematkan'} ${s.title}`}
                        aria-pressed={!!s.isPinned}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPinSession?.(s.id, !s.isPinned);
                        }}
                        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-none transition active:bg-chill-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                          s.isPinned ? 'text-chill-accent' : 'hover:text-chill-accent'
                        }`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill={s.isPinned ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="square"
                          shapeRendering="crispEdges"
                          aria-hidden="true"
                        >
                          <path d="M12 21s-5.5-4.8-5.5-9.5a5.5 5.5 0 0 1 11 0C17.5 16.2 12 21 12 21Z" />
                          {!s.isPinned && <circle cx="12" cy="11" r="2" />}
                        </svg>
                      </button>
                    )}
                    {onArchiveSession && isServerConversation(s.id) && (
                      <button
                        type="button"
                        title={s.isArchived ? 'Buka dari arsip' : 'Arsipkan'}
                        aria-label={`${s.isArchived ? 'Buka dari arsip' : 'Arsipkan'} ${s.title}`}
                        aria-pressed={!!s.isArchived}
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveSession?.(s.id, !s.isArchived);
                        }}
                        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-none transition active:bg-chill-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
                          s.isArchived ? 'text-chill-accent' : 'hover:text-chill-accent'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={s.isArchived ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="4" />
                          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                          <line x1="10" y1="12" x2="14" y2="12" />
                        </svg>
                      </button>
                    )}
                    {onForkSession && isServerConversation(s.id) && s.messages.length > 0 && (
                      <button
                        type="button"
                        title="Duplikat sesi"
                        aria-label={`Duplikat ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onForkSession?.(s.id);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-accent active:bg-chill-elevated rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M6 3h12" /><path d="M6 3v15l-3 3v-18h3" /><path d="M18 3v9l-3 3" /><path d="M6 12h12" /></svg>
                      </button>
                    )}
                    {onRenameSession && isServerConversation(s.id) && (
                      <button
                        type="button"
                        title="Ganti nama sesi"
                        aria-label={`Ganti nama ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameDraft(s.title);
                          setRenamingId(s.id);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-accent active:bg-chill-elevated rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                    )}
                    {onDeleteSession && (
                      <button
                        type="button"
                        title="Hapus sesi"
                        aria-label={`Hapus ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteId(s.id);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-red active:bg-chill-red/10 rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                  </>
                  )}
                </div>
              );
                })}
              </div>
            ))}
          </div>
          {hasMore && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              aria-label="Muat lebih banyak percakapan"
              className="w-full flex items-center justify-center gap-2 mt-1 min-h-[44px] rounded-none border border-chill-border bg-chill-surface text-sm text-chill-accent font-medium hover:bg-chill-elevated active:bg-chill-elevated active:translate-y-[2px] active:shadow-none transition pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              Muat lebih banyak
            </button>
          )}
        </div>
      )}

      {/* Audit: per-message token/cost table for the active thread (mobile-accessible via the drawer). */}
      {onOpenAudit && (
        <button
          type="button"
          onClick={onOpenAudit}
          aria-label="Audit percakapan"
          className="w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-none bg-chill-surface text-sm font-medium text-chill-text border border-chill-border hover:border-chill-accent hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition pixel-shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
          Audit Percakapan
        </button>
      )}

      {/* Usage / audit overview — cumulative tokens and estimated cost across every stored conversation */}
      {byModelEntries.length > 0 && (
        <>
        <details className="group space-y-2 bg-chill-surface/70 border border-chill-border rounded-none p-2.5">
          <summary className="list-none text-sm font-semibold text-chill-text hover:text-chill-accent transition-colors cursor-pointer active:translate-y-[2px] flex items-center justify-between select-none min-h-[44px] gap-1 px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              Penggunaan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-chill-accent font-mono">{formatTokens(usage.totalTokens)} token</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="text-chill-muted transition-transform duration-150 [transition-timing-function:steps(3,jump-none)] group-open:rotate-180">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </summary>
          <div className="pt-2 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-chill-muted">
              <span>{usage.conversationCount} percakapan</span>
              <span aria-label={`Perkiraan total biaya ${formatUsd(totalUsd)}`}>≈ {formatUsd(totalUsd)}</span>
            </div>
            {(usage.totalUpFeedback > 0 || usage.totalDownFeedback > 0) && (
              <div className="flex items-center justify-between text-xs text-chill-muted">
                <span className="flex items-center gap-1">Umpan balik pesan</span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5" title="Disukai">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                    <span className="text-chill-text">{usage.totalUpFeedback}</span>
                  </span>
                  <span className="flex items-center gap-0.5" title="Tidak disukai">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                    <span className="text-chill-text">{usage.totalDownFeedback}</span>
                  </span>
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {byModelEntries.map(([id, u]) => (
                <div key={id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-chill-muted" title={id}>{id}</span>
                  <span className="shrink-0 text-chill-text">{formatTokens(u.totalTokens)} · ≈{formatUsd(estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, id))}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          aria-label="Buka statistik chat"
          className="rounded-none w-full mt-2 inline-flex items-center justify-center gap-1.5 min-h-[44px] bg-chill-surface text-sm font-medium text-chill-text border border-chill-border hover:border-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition pixel-shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>
          Statistik Chat
        </button>
        <ChatStatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} usage={usage} modelOptions={historyModels ?? models} />
        </>
      )}

      {/* Mode Toggle */}
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-3 cursor-pointer bg-chill-surface p-3 border border-chill-border hover:border-chill-accent active:border-chill-accent active:translate-y-[2px] active:shadow-none transition pixel-shadow-sm">
          <input
            type="checkbox"
            checked={useAgent}
            onChange={onToggleMode}
            aria-label="Mode Agen"
            className="h-4 w-4 pixel-checkbox"
          />
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              {useAgent ? <BotIcon /> : <BoltIcon />}
              {useAgent ? 'Agent Mode' : 'Direct Mode'}
            </div>
            <div className="text-xs text-chill-muted">
              {useAgent ? 'Hermes Gateway (tools + memory)' : 'Langsung ke LLM (cepat)'}
            </div>
          </div>
        </label>
      </div>

      {/* Night / calm mode toggle */}
      {typeof onNightModeChange === 'function' && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-chill-surface p-3 border border-chill-border hover:border-chill-accent active:border-chill-accent active:translate-y-[2px] active:shadow-none transition pixel-shadow-sm">
            <input
              type="checkbox"
              checked={nightMode}
              onChange={() => onNightModeChange(!nightMode)}
              aria-label="Mode malam"
              className="h-4 w-4 pixel-checkbox"
            />
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" /></svg>
                Mode Malam
              </div>
              <div className="text-xs text-chill-muted">Palet redup & tenang untuk malam</div>
            </div>
          </label>
        </div>
      )}

      {/* Focus mode toggle */}
      {typeof onFocusModeChange === 'function' && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-chill-surface p-3 border border-chill-border hover:border-chill-accent active:border-chill-accent active:translate-y-[2px] active:shadow-none transition pixel-shadow-sm">
            <input
              type="checkbox"
              checked={focusMode}
              onChange={() => onFocusModeChange(!focusMode)}
              aria-label="Mode fokus"
              className="h-4 w-4 pixel-checkbox"
            />
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><rect x="3" y="3" width="18" height="18" /><rect x="7" y="7" width="10" height="10" /></svg>
                Mode Fokus
              </div>
              <div className="text-xs text-chill-muted">Sembunyikan hiasan & telemetri</div>
            </div>
          </label>
        </div>
      )}

      {/* Chill Mode toggle */}
      {typeof onChillModeChange === 'function' && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-chill-surface p-3 border border-chill-border hover:border-chill-accent active:border-chill-accent active:translate-y-[2px] active:shadow-none transition pixel-shadow-sm">
            <input
              type="checkbox"
              checked={chillMode}
              onChange={() => onChillModeChange(!chillMode)}
              aria-label="Chill Mode"
              className="h-4 w-4 pixel-checkbox"
            />
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <ChillIcon size={14} />
                Chill Mode
              </div>
              <div className="text-xs text-chill-muted">Persona santai untuk suasana rileks</div>
            </div>
          </label>
        </div>
      )}

      {/* Model Selector */}
      <div className="space-y-1">
        <label htmlFor="model-select" className="text-xs text-chill-muted font-medium">Model</label>
        <div className="relative">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full appearance-none bg-chill-surface border border-chill-border px-3 py-3 pr-9 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] cursor-pointer hover:border-chill-accent/60 transition-colors pixel-shadow-sm [color-scheme:dark]"
            id="model-select"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square" shapeRendering="crispEdges"
            strokeLinejoin="miter"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1">
        <label htmlFor="api-key-input" className="text-xs text-chill-muted font-medium flex items-center gap-1">
          API Key
          <span data-testid={apiKey ? 'lock-icon' : 'unlock-icon'} className="inline-flex text-chill-muted">
            {apiKey ? <LockIcon /> : <UnlockIcon />}
          </span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="(kosong = tanpa auth)"
          className="w-full bg-chill-surface border border-chill-border px-3 py-3 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
          id="api-key-input"
        />
        <p className="text-xs text-chill-muted">
          {apiKey ? 'Authenticated — header X-Api-Key aktif.' : 'Tanpa auth — backend tanpa API key.'}
        </p>
        {apiKey && (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-none mt-2 w-full border border-chill-border px-3 py-2 text-sm text-chill-text transition hover:border-chill-accent hover:text-chill-accent active:translate-y-[2px] active:shadow-none min-h-[44px] pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            Keluar
          </button>
        )}
      </div>

      {/* Advanced Parameters & } ; System Prompt */}
      {settings && (
        <details className="group space-y-2 bg-chill-surface/70 border border-chill-border rounded-none p-2.5">
          <summary className="list-none text-sm font-semibold text-chill-text hover:text-chill-accent transition-colors cursor-pointer active:translate-y-[2px] flex items-center justify-between select-none min-h-[44px] gap-1 px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              Parameter & Persona
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-chill-accent font-mono">T: {settings.temperature}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="text-chill-muted transition-transform duration-150 [transition-timing-function:steps(3,jump-none)] group-open:rotate-180">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </summary>
          <div className="pt-2 space-y-2.5">
            <div>
              <label htmlFor="system-prompt-input" className="block text-xs text-chill-muted font-medium mb-1">
                System Prompt (Instruksi Peran)
              </label>
              <textarea
                id="system-prompt-input"
                rows={2}
                value={settings.systemPrompt}
                onChange={(e) => onSystemPromptChange?.(e.target.value)}
                placeholder="Contoh: Bertindak sebagai Software Architect..."
                className="w-full bg-chill-surface border border-chill-border p-2 text-base md:text-sm outline-none hover:border-chill-accent/60 focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 resize-none"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-chill-muted mb-1">
                <span>Temperature</span>
                <span className="font-mono text-chill-accent">{settings.temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.1"
                aria-label="Temperature"
                value={settings.temperature}
                onChange={(e) => onTemperatureChange?.(parseFloat(e.target.value))}
                className="w-full accent-chill-accent cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-chill-muted mb-1">
                <span>Max Tokens</span>
                <span className="font-mono text-chill-accent">{settings.maxTokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                aria-label="Max Tokens"
                value={settings.maxTokens}
                onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value, 10))}
                className="w-full accent-chill-accent cursor-pointer"
              />
            </div>
            {onResetPersona && (
              <button
                type="button"
                onClick={onResetPersona}
                className="rounded-none w-full border border-chill-border px-3 py-2 text-sm text-chill-text transition hover:border-chill-accent hover:text-chill-accent active:translate-y-[2px] active:shadow-none min-h-[44px] pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
              >
                Reset parameter
              </button>
            )}
          </div>
        </details>
      )}

      {!pendingClear ? (
        <button
          type="button"
          onClick={() => setPendingClear(true)}
          aria-label="Bersihkan percakapan"
          className="rounded-none mt-auto text-sm text-chill-muted hover:text-chill-red active:text-chill-red active:translate-y-[2px] transition text-left py-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" className="shrink-0 mr-1.5 -mt-0.5" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Clear chat
        </button>
      ) : (
        <div
          className="mt-auto flex items-center justify-between gap-1 pl-1 pr-1"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPendingClear(false);
            }
          }}
        >
          <span className="truncate text-sm text-chill-text">Bersihkan chat?</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              autoFocus
              onClick={() => setPendingClear(false)}
              aria-label="Batal bersihkan chat"
              className="min-h-[44px] min-w-[52px] rounded-none border-2 border-chill-border px-2 text-sm text-chill-text transition hover:bg-chill-surface hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] active:shadow-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingClear(false);
                onClear();
              }}
              aria-label="Konfirmasi bersihkan chat"
              className="min-h-[44px] min-w-[52px] rounded-none bg-chill-red text-chill-on-red px-2 text-sm font-medium transition hover:bg-chill-red-hover active:bg-chill-red-active active:translate-y-[2px] active:shadow-none pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
            >
              Bersihkan
            </button>
          </div>
        </div>
      )}
      <BackendStatus status={backendStatus} />
    </aside>
  );
}
