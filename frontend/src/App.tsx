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
  const [apiKey, setApiKey] = useApiKey();
  const { locked, busy, error, attemptLogin, logout } = useAuthGate(apiKey, setApiKey);
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
    adoptConversation,
    exportSessionMarkdown,
  } = useServerHistory({ apiKey });

  const {
    settings,
    updateSystemPrompt,
    updateTemperature,
    updateMaxTokens,
  } = useSettings();

  const catalog = useModelCatalog(apiKey);
  const models = useAgent ? catalog.agent : catalog.direct;

  const {
    messages,
    streaming,
    send: sendMessage,
    stop: stopStreaming,
    clear: clearMessages,
    loadMessages,
  } = useChat({
    model,
    useHermesBridge: useAgent,
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
    return <LoginScreen onSubmit={attemptLogin} busy={busy} error={error} />;
  }

  return (
    <div className="flex h-dvh bg-slate-950 text-slate-100 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
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
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onExportSession={exportSessionMarkdown}
        settings={settings}
        onSystemPromptChange={updateSystemPrompt}
        onTemperatureChange={updateTemperature}
        onMaxTokensChange={updateMaxTokens}
      />

      <main className="flex-1 flex flex-col min-w-0" aria-hidden={sidebarOpen}>
        <MobileTopBar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={openDrawer}
          useAgent={useAgent}
          menuButtonRef={menuButtonRef}
        />

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
      </main>
    </div>
  );
}
