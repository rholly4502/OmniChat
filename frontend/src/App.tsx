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
    exportSessionMarkdown,
  } = useServerHistory({ apiKey, search: historySearch });

  const {
    settings,
    updateSystemPrompt,
    updateTemperature,
    updateMaxTokens,
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

  async function handleSelectSession(id: string) {
    if (streaming) return;
    const token = ++loadTokenRef.current;
    const loaded = await selectSession(id);
    // null means the transcript could not be read; the current view stays put.
    // A second click while this fetch was in flight owns the screen instead.
    if (!loaded || token !== loadTokenRef.current) return;
    // Continuing a stored conversation must append to *that* thread on the server,
    // not silently create a second one under the same title.
    loadMessages(loaded, isServerConversation(id) ? id : null);
  }

  function handleNewSession() {
    if (streaming) return;
    loadTokenRef.current++;
    const fresh = createSession();
    loadMessages(fresh.messages);
  }

  async function handleDeleteSession(id: string) {
    if (streaming) return;
    loadTokenRef.current++;
    const next = await deleteSession(id);
    if (next) loadMessages(next);
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
      <div className="relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-chill-accent opacity-[0.04] pixel-grid" />
        <main className="flex-1 flex flex-col min-w-0">
          <MobileTopBar isGuest onLogout={logout} useAgent={false} />
          <MessageList
            messages={messages}
            streaming={streaming}
            models={catalog.direct}
            model={model}
            useAgent={false}
            scrollRef={scrollRef}
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
    <div className="relative flex h-dvh bg-chill-bg text-chill-text overflow-hidden"
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
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onPinSession={handlePinSession}
        onExportSession={exportSessionMarkdown}
        settings={settings}
        onSystemPromptChange={updateSystemPrompt}
        onTemperatureChange={updateTemperature}
        onMaxTokensChange={updateMaxTokens}
        activeView={activeView}
        onSelectView={setActiveView}
      />

      <main className="flex-1 flex flex-col min-w-0" aria-hidden={sidebarOpen}>
        <MobileTopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={openDrawer}
          useAgent={useAgent}
          menuButtonRef={menuButtonRef}
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
