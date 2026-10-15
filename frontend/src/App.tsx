import { useRef, useState } from 'react';
import { CodeBlock } from './components/CodeBlock';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { MobileTopBar } from './components/MobileTopBar';
import { SidebarOverlay } from './components/SidebarOverlay';
import { useApiKey } from './hooks/useApiKey';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useChat } from './hooks/useChat';
import { useSidebarDrawer } from './hooks/useSidebarDrawer';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

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

  const catalog = useModelCatalog(apiKey);
  const models = useAgent ? catalog.agent : catalog.direct;

  const {
    messages,
    streaming,
    send: sendMessage,
    stop: stopStreaming,
    clear: clearMessages,
  } = useChat({
    model,
    useHermesBridge: useAgent,
    apiKey,
    describeError: describeApiError,
  });

  useAutoScroll(messages, scrollRef);

  function toggleMode() {
    const next = !useAgent;
    setUseAgent(next);
    setModel(next ? catalog.agent[0].id : catalog.direct[0].id);
  }

  /** Validate the draft, clear it, then hand the text to the chat hook. */
  async function send() {
    if (!input.trim() || streaming) return;
    const text = input;
    setInput('');
    await sendMessage(text);
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
        onClear={clearMessages}
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
