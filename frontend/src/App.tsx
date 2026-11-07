import { useEffect, useRef, useState } from 'react';
import { CodeBlock } from './components/CodeBlock';
import LoginScreen from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { MobileTopBar } from './components/MobileTopBar';
import { ChatHeader } from './components/ChatHeader';
import { ChatStatsDialog } from './components/ChatStatsDialog';
import { ConversationAuditDialog } from './components/ConversationAuditDialog';
import { SidebarOverlay } from './components/SidebarOverlay';
import { useApiKey } from './hooks/useApiKey';
import { useComposerDraft } from './hooks/useComposerDraft';
import { useAuthGate } from './hooks/useAuthGate';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useApiHealth } from './hooks/useApiHealth';
import { useChat } from './hooks/useChat';
import { useSidebarDrawer } from './hooks/useSidebarDrawer';
import { useChatShortcuts } from './hooks/useChatShortcuts';
import { isServerConversation, useServerHistory } from './hooks/useServerHistory';
import { setMessageFeedback } from './historyApi';
import { useSettings } from './hooks/useSettings';
import { ExpensesView } from './components/ExpensesView';
import { JobsView } from './components/JobsView';
import { describeApiError } from './errors';
import type { TokenUsage } from './types';
import { DEFAULT_MODEL, CHILL_SYSTEM_PROMPT } from './constants';

// Re-exported for backwards compatibility (tests import it from './App').
export { CodeBlock };

/**
 * Composition root (frontend decomposition step 9).
 *
 * Every stateful concern lives in a hook and every presentational concern is a
 * child component, so this file only wires them together and owns the four DOM
 * refs (which the hooks cannot create, because they do not own the elements).
 */
export default function App() {
  const { draft: input, setDraft: setInput, clearDraft: clearInput } = useComposerDraft();
  const [useAgent, setUseAgent] = useState(true);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [activeView, setActiveView] = useState<'chat' | 'expenses' | 'jobs'>('chat');
  const [statsOpen, setStatsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyModelFilter, setHistoryModelFilter] = useState('');
  const [historyModeFilter, setHistoryModeFilter] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [apiKey, setApiKey] = useApiKey();
  const { locked, busy, error, attemptLogin, enterGuest, logout, isGuest } = useAuthGate(apiKey, setApiKey);
  // A guest has no credential and must never reach the Hermes agent gateway: force direct mode.
  const effectiveUseAgent = isGuest ? false : useAgent;
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [searchSignal, setSearchSignal] = useState(0);
  /** Discards a transcript that arrives after the user has switched again. */
  const loadTokenRef = useRef(0);

  const {
    open: sidebarOpen,
    openDrawer,
    closeDrawer,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  } = useSidebarDrawer({
    sidebarRef,
    openFocusRef: closeButtonRef,
    restoreFocusRef: menuButtonRef,
  });

  const {
    sessions,
    activeSession,
    activeSessionId,
    updateActiveSessionMessages,
    createSession,
    selectSession,
    deleteSession,
    deleteMessageFromActive,
    renameSession,
    pinSession,
    archiveSession,
    updateActiveConversationSettings,
    adoptConversation,
    exportSession,
    copyTranscript,
    usageSummary,
    loadMore,
    hasMore,
  } = useServerHistory({ apiKey, search: historySearch, modelFilter: historyModelFilter, modeFilter: historyModeFilter, dateFrom: historyDateFrom, dateTo: historyDateTo });

  const {
    settings,
    updateSystemPrompt,
    updateTemperature,
    updateMaxTokens,
    updateNightMode,
    updateFocusMode,
    updateChillMode,
    resetPersona,
  } = useSettings();

  // Chill Mode prepends a relaxed persona prompt ahead of the user's own system
  // prompt (if any). Composed here, at the composition root, so the chat hook
  // keeps receiving a single plain `systemPrompt` string.
  const effectiveSystemPrompt = settings.chillMode
    ? [CHILL_SYSTEM_PROMPT, settings.systemPrompt].filter(Boolean).join('\n\n')
    : settings.systemPrompt;

  const catalog = useModelCatalog(apiKey);
  const backendStatus = useApiHealth();
  const models = effectiveUseAgent ? catalog.agent : catalog.direct;
  // History spans both modes, so the filter dropdown must offer every model a
  // conversation could have run on — not just the active mode's catalog.
  const historyModels = [...catalog.agent, ...catalog.direct].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  );

  const {
    messages,
    streaming,
    send: sendMessage,
    stop: stopStreaming,
    clear: clearMessages,
    loadMessages,
    regenerate,
    editAndResend,
    usage,
    streamingEstimate,
  } = useChat({
    model,
    useHermesBridge: effectiveUseAgent,
    apiKey,
    systemPrompt: effectiveSystemPrompt,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    describeError: describeApiError,
    initialMessages: activeSession?.messages,
    // The server answers with the thread id as the first frame of the first turn;
    // that is what turns this browser's draft into a stored conversation.
    onConversationId: adoptConversation,
  });

  // Sync message state to active session
  useEffect(() => {
    updateActiveSessionMessages(messages);
  }, [messages, updateActiveSessionMessages]);

  useAutoScroll(messages, scrollRef);

  /**
   * Persist a rating for a stored turn. Only meaningful for server conversations and
   * when the message has already been filed (has an id). Returns false on any failure
   * so the caller can roll the optimistic toggle back.
   */
  async function handleSetFeedback(messageId: string, feedback: 'up' | 'down' | null): Promise<boolean> {
    const sessionId = activeSessionId;
    if (!sessionId || !isServerConversation(sessionId)) return false;
    try {
      await setMessageFeedback(sessionId, messageId, feedback, { apiKey });
      return true;
    } catch {
      return false;
    }
  }

  /** Delete one stored turn (and everything newer) from the active conversation. */
  async function handleDeleteMessage(messageId: string): Promise<boolean> {
    if (streaming) return false;
    const token = ++loadTokenRef.current;
    const next = await deleteMessageFromActive(messageId);
    // null means the server refused; the transcript stays as it is.
    if (next && token === loadTokenRef.current) {
      loadMessages(next, activeSessionId, baseUsageFor(activeSession));
      return true;
    }
    return false;
  }

  /** Persist a per-conversation model/mode change immediately so resuming the
   * thread keeps it even before the next turn is sent. Drafts (non-server
   * ids) and mid-stream changes are skipped — the next send persists anyway.
   */
  function persistActiveSettings(model?: string, mode?: string) {
    if (streaming) return;
    void updateActiveConversationSettings(model, mode);
  }

  function toggleMode() {
    const next = !useAgent;
    const m = next ? catalog.agent[0].id : catalog.direct[0].id;
    setUseAgent(next);
    setModel(m);
    persistActiveSettings(m, next ? 'agent' : 'direct');
  }

  function handleModelChange(next: string) {
    setModel(next);
    persistActiveSettings(next, undefined);
  }

  /** Server-reported token base for a session, used to seed the live usage counter. */
  function baseUsageFor(s: { promptTokens?: number; completionTokens?: number } | undefined): TokenUsage {
    return { promptTokens: s?.promptTokens ?? 0, completionTokens: s?.completionTokens ?? 0 };
  }

  async function handleSelectSession(id: string) {
    if (streaming) return;
    const token = ++loadTokenRef.current;
    const loaded = await selectSession(id);
    // null means the transcript could not be read; the current view stays put.
    // A second click while this fetch was in flight owns the screen instead.
    if (!loaded || token !== loadTokenRef.current) return;
    // Continuing a stored conversation must append to *that* thread on the server,
    // not silently create a second one under the same title. Seed the live usage
    // counter with the server's cumulative tokens for that conversation.
    const session = sessions.find((s) => s.id === id);
    loadMessages(loaded, isServerConversation(id) ? id : null, baseUsageFor(session));
    // Multi-model per chat: resuming a conversation restores the model (and mode) it
    // last used, so the header, sidebar and the agent/direct bridge reflect that
    // conversation's setup, not the global toggle.
    if (session?.mode) setUseAgent(session.mode === 'agent');
    if (session?.model) setModel(session.model);
  }

  function handleNewSession() {
    if (streaming) return;
    loadTokenRef.current++;
    const fresh = createSession();
    loadMessages(fresh.messages, null, { promptTokens: 0, completionTokens: 0 });
    setModel(DEFAULT_MODEL);
  }

  async function handleDeleteSession(id: string) {
    if (streaming) return;
    loadTokenRef.current++;
    const next = await deleteSession(id);
    if (next) loadMessages(next, null, { promptTokens: 0, completionTokens: 0 });
  }

  /** Rename a stored conversation; updates the sidebar row on success. */
  async function handleRenameSession(id: string, title: string): Promise<boolean> {
    if (streaming) return false;
    return renameSession(id, title);
  }

  /** Pin/unpin a stored conversation; the hook re-sorts on success. */
  async function handlePinSession(id: string, pinned: boolean): Promise<boolean> {
    if (streaming) return false;
    return pinSession(id, pinned);
  }

  /** Archive/unarchive a stored conversation; the hook updates the row on success. */
  async function handleArchiveSession(id: string, archived: boolean): Promise<boolean> {
    if (streaming) return false;
    return archiveSession(id, archived);
  }

  /** Validate the draft, clear it, then hand the text to the chat hook. */
  async function send() {
    if (!input.trim() || streaming) return;
    const text = input;
    clearInput();
    await sendMessage(text);
  }

  /** Prefill the composer with a quick-start suggestion (empty state). */
  function handleSelectSuggestion(prompt: string) {
    setInput(prompt);
  }

  // Global keyboard shortcuts: `/` or Ctrl+K focus the composer, Ctrl+Shift+F
  // opens in-transcript search, Ctrl+N starts a new chat (admin only). The
  // hook itself guards against typing targets and open dialogs.
  useChatShortcuts({
    onFocusComposer: () => composerRef.current?.focus(),
    onOpenSearch: () => setSearchSignal((n) => n + 1),
    onNewSession: () => { if (!isGuest) void handleNewSession(); },
  });

  // A valid credential is the front door of the workspace: without one there is
  // nothing meaningful to render, so lock the whole surface behind the login form.
  if (locked) {
    return <LoginScreen onSubmit={attemptLogin} busy={busy} error={error} onEnterGuest={enterGuest} />;
  }

  // Guest workspace: no sidebar, no history, no agent gateway — just the transcript and composer,
  // with a slim top bar exposing logout.
  if (isGuest) {
    return (
      <div className={`relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden${settings.nightMode ? " night-mode" : ""}${settings.focusMode ? " focus-mode" : ""}`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-chill-accent opacity-[0.04] pixel-grid" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileTopBar isGuest onLogout={logout} useAgent={false} usage={usage} streamingEstimate={streamingEstimate} model={model} modelLabel={catalog.direct.find((m) => m.id === model)?.label} models={catalog.direct} onModelChange={setModel} chillMode={settings.chillMode} />
          <MessageList
            messages={messages}
            streaming={streaming}
            models={catalog.direct}
            model={model}
            useAgent={false}
            scrollRef={scrollRef}
            conversationKey="guest"
            searchSignal={searchSignal}
            onRegenerate={regenerate}
            onEditMessage={editAndResend}
            onSelectSuggestion={handleSelectSuggestion}
          />
          <Composer
            input={input}
            onInputChange={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stopStreaming}
            model={model}
            inputRef={composerRef}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden${settings.nightMode ? " night-mode" : ""}${settings.focusMode ? " focus-mode" : ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-chill-accent opacity-[0.04] pixel-grid" />
      {sidebarOpen && <SidebarOverlay onClose={closeDrawer} />}

      <Sidebar
        sidebarRef={sidebarRef}
        open={sidebarOpen}
        onClose={closeDrawer}
        closeButtonRef={closeButtonRef}
        useAgent={useAgent}
        onToggleMode={toggleMode}
        models={models}
        historyModels={historyModels}
        model={model}
        onModelChange={handleModelChange}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onLogout={logout}
        onClear={clearMessages}
        sessions={sessions}
        search={historySearch}
        onSearchChange={setHistorySearch}
        modelFilter={historyModelFilter}
        onModelFilterChange={setHistoryModelFilter}
        modeFilter={historyModeFilter}
        onModeFilterChange={setHistoryModeFilter}
        dateFrom={historyDateFrom}
        dateTo={historyDateTo}
        onDateFromChange={setHistoryDateFrom}
        onDateToChange={setHistoryDateTo}
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onPinSession={handlePinSession}
        onArchiveSession={handleArchiveSession}
        showArchived={showArchived}
        onToggleShowArchived={() => setShowArchived((v) => !v)}
        onExportSession={exportSession}
        onLoadMore={loadMore}
        hasMore={hasMore}
        usageSummary={usageSummary}
        onOpenAudit={() => setAuditOpen(true)}
        settings={settings}
        onSystemPromptChange={updateSystemPrompt}
        onResetPersona={resetPersona}
        onTemperatureChange={updateTemperature}
        onMaxTokensChange={updateMaxTokens}
        nightMode={settings.nightMode}
        onNightModeChange={updateNightMode}
        focusMode={settings.focusMode}
        onFocusModeChange={updateFocusMode}
        chillMode={settings.chillMode}
        onChillModeChange={updateChillMode}
        activeView={activeView}
        onSelectView={setActiveView}
        backendStatus={backendStatus}
      />

      <main className="flex-1 flex flex-col min-w-0" aria-hidden={sidebarOpen}>
        <MobileTopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={openDrawer}
          useAgent={useAgent}
          menuButtonRef={menuButtonRef}
          usage={usage}
          streamingEstimate={streamingEstimate}
          model={model}
          modelLabel={models.find((m) => m.id === model)?.label}
          models={models}
          onModelChange={handleModelChange}
          chillMode={settings.chillMode}
          activeView={activeView}
        />

        {activeView === 'expenses' ? (
          <ExpensesView apiKey={apiKey} />
        ) : activeView === 'jobs' ? (
          <JobsView apiKey={apiKey} />
        ) : (
          <div key={activeView} className="flex-1 flex flex-col min-h-0 pixel-reveal">
            <ChatHeader
              useAgent={useAgent}
              model={model}
              modelLabel={models.find((m) => m.id === model)?.label}
              usage={usage}
              streamingEstimate={streamingEstimate}
              models={models}
              onModelChange={handleModelChange}
              onOpenStats={() => setStatsOpen(true)}
              onOpenAudit={() => setAuditOpen(true)}
              onCopyTranscript={() => { if (activeSession) void copyTranscript(activeSession); }}
              onExport={(fmt) => { if (activeSession) exportSession(activeSession, fmt); }}
              chillMode={settings.chillMode}
            />
            <MessageList
              messages={messages}
              streaming={streaming}
              models={models}
              model={model}
              useAgent={useAgent}
              scrollRef={scrollRef}
              conversationKey={activeSessionId}
              searchSignal={searchSignal}
              onRegenerate={regenerate}
              onEditMessage={editAndResend}
              onSetFeedback={handleSetFeedback}
              onDeleteMessage={handleDeleteMessage}
              onSelectSuggestion={handleSelectSuggestion}
            />

            <Composer
              input={input}
              onInputChange={setInput}
              streaming={streaming}
              onSend={send}
              onStop={stopStreaming}
              model={model}
              inputRef={composerRef}
            />
            <ChatStatsDialog
              open={statsOpen}
              onClose={() => setStatsOpen(false)}
              usage={usageSummary}
              modelOptions={historyModels}
              apiKey={apiKey}
            />
            <ConversationAuditDialog
              open={auditOpen}
              onClose={() => setAuditOpen(false)}
              session={activeSession}
              modelOptions={historyModels}
            />
          </div>
        )}
      </main>
    </div>
  );
}
