import { useEffect, useRef, useState } from 'react';
import { CodeBlock } from './components/CodeBlock';
import LoginScreen from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { MobileTopBar } from './components/MobileTopBar';
import { SidebarOverlay } from './components/SidebarOverlay';
import { useApiKey } from './hooks/useApiKey';
import { useAuthGate } from './hooks/useAuthGate';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useChat } from './hooks/useChat';
import { useSidebarDrawer } from './hooks/useSidebarDrawer';
import { isServerConversation, useServerHistory } from './hooks/useServerHistory';
import { useSettings } from './hooks/useSettings';
import { ExpensesView } from './components/ExpensesView';
import { describeApiError } from './errors';
import type { TokenUsage } from './types';
import { DEFAULT_MODEL } from './constants';

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
  const [input, setInput] = useState('');
  const [useAgent, setUseAgent] = useState(true);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [activeView, setActiveView] = useState<'chat' | 'expenses'>('chat');
  const [historySearch, setHistorySearch] = useState('');
  const [historyModelFilter, setHistoryModelFilter] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [apiKey, setApiKey] = useApiKey();
  const { locked, busy, error, attemptLogin, enterGuest, logout, isGuest } = useAuthGate(apiKey, setApiKey);
  // A guest has no credential and must never reach the Hermes agent gateway: force direct mode.
  const effectiveUseAgent = isGuest ? false : useAgent;
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
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
    renameSession,
    pinSession,
    adoptConversation,
    exportSession,
    usageSummary,
  } = useServerHistory({ apiKey, search: historySearch, modelFilter: historyModelFilter, dateFrom: historyDateFrom, dateTo: historyDateTo });

  const {
    settings,
    updateSystemPrompt,
    updateTemperature,
    updateMaxTokens,
    updateNightMode,
  } = useSettings();

  const catalog = useModelCatalog(apiKey);
  const models = effectiveUseAgent ? catalog.agent : catalog.direct;

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
  } = useChat({
    model,
    useHermesBridge: effectiveUseAgent,
    apiKey,
    systemPrompt: settings.systemPrompt,
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

  function toggleMode() {
    const next = !useAgent;
    setUseAgent(next);
    setModel(next ? catalog.agent[0].id : catalog.direct[0].id);
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

  /** Validate the draft, clear it, then hand the text to the chat hook. */
  async function send() {
    if (!input.trim() || streaming) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  }

  // A valid credential is the front door of the workspace: without one there is
  // nothing meaningful to render, so lock the whole surface behind the login form.
  if (locked) {
    return <LoginScreen onSubmit={attemptLogin} busy={busy} error={error} onEnterGuest={enterGuest} />;
  }

  // Guest workspace: no sidebar, no history, no agent gateway — just the transcript and composer,
  // with a slim top bar exposing logout.
  if (isGuest) {
    return (
      <div className={`relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden${settings.nightMode ? " night-mode" : ""}`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-chill-accent opacity-[0.04] pixel-grid" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileTopBar isGuest onLogout={logout} useAgent={false} usage={usage} model={model} modelLabel={catalog.direct.find((m) => m.id === model)?.label} />
          <MessageList
            messages={messages}
            streaming={streaming}
            models={catalog.direct}
            model={model}
            useAgent={false}
            scrollRef={scrollRef}
            onRegenerate={regenerate}
            onEditMessage={editAndResend}
          />
          <Composer
            input={input}
            onInputChange={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stopStreaming}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden${settings.nightMode ? " night-mode" : ""}`}
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
        model={model}
        onModelChange={setModel}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onLogout={logout}
        onClear={clearMessages}
        sessions={sessions}
        search={historySearch}
        onSearchChange={setHistorySearch}
        modelFilter={historyModelFilter}
        onModelFilterChange={setHistoryModelFilter}
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
        onExportSession={exportSession}
        usageSummary={usageSummary}
        settings={settings}
        onSystemPromptChange={updateSystemPrompt}
        onTemperatureChange={updateTemperature}
        onMaxTokensChange={updateMaxTokens}
        nightMode={settings.nightMode}
        onNightModeChange={updateNightMode}
        activeView={activeView}
        onSelectView={setActiveView}
      />

      <main className="flex-1 flex flex-col min-w-0" aria-hidden={sidebarOpen}>
        <MobileTopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={openDrawer}
          useAgent={useAgent}
          menuButtonRef={menuButtonRef}
          usage={usage}
          model={model}
          modelLabel={models.find((m) => m.id === model)?.label}
          activeView={activeView}
        />

        {activeView === 'expenses' ? (
          <ExpensesView apiKey={apiKey} />
        ) : (
          <>
            <MessageList
              messages={messages}
              streaming={streaming}
              models={models}
              model={model}
              useAgent={useAgent}
              scrollRef={scrollRef}
              onRegenerate={regenerate}
              onEditMessage={editAndResend}
            />

            <Composer
              input={input}
              onInputChange={setInput}
              streaming={streaming}
              onSend={send}
              onStop={stopStreaming}
            />
          </>
        )}
      </main>
    </div>
  );
}
