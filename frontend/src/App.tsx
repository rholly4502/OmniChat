import { useRef, useState, useEffect } from 'react';
import { ApiError } from './api';
import { BotIcon, BoltIcon } from './components/Icons';
import { CodeBlock } from './components/CodeBlock';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useChat } from './hooks/useChat';
import { useSidebarDrawer } from './hooks/useSidebarDrawer';
import { API_KEY_STORAGE, DEFAULT_MODEL } from './constants';

// Re-exported for backwards compatibility (tests import it from './App').
export { CodeBlock };

/**
 * Localized, user-facing message for a failed chat request. Kept in App.tsx
 * (not api.ts) so the transport stays free of presentation strings.
 */
function describeApiError(err: ApiError): string {
  if (err.status === 401) return 'Autentikasi diperlukan (401). Masukkan API key di sidebar.';
  if (err.status === 429) {
    return err.retryAfter
      ? `Terlalu banyak permintaan (429). Coba lagi dalam ${err.retryAfter} detik.`
      : 'Terlalu banyak permintaan (429). Coba lagi nanti.';
  }
  if (err.status === 400) return 'Permintaan tidak valid (400). Periksa input.';
  return `Backend menolak permintaan (${err.status}).`;
}

/**
 * Composition root. State ownership lives here (or in the hooks); every
 * presentational concern is a child component.
 */
export default function App() {
  const [input, setInput] = useState('');
  const [useAgent, setUseAgent] = useState(true);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
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

  useEffect(() => {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey);
    else localStorage.removeItem(API_KEY_STORAGE);
  }, [apiKey]);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isNewMessage = messages.length !== prevMsgCount.current;
    prevMsgCount.current = messages.length;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: prefersReducedMotion || !isNewMessage ? 'auto' : 'smooth',
    });
  }, [messages]);

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
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

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

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0" aria-hidden={sidebarOpen}>
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-slate-800 bg-slate-950" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}>
          <button
            ref={menuButtonRef}
            onClick={openDrawer}
            aria-expanded={sidebarOpen}
            aria-controls="chat-sidebar"
            className="text-slate-400 hover:text-cyan-400 active:bg-slate-800/50 p-2 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Open menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-cyan-400">OmniChat</span>
          <span className="text-xs text-slate-400 ml-auto inline-flex items-center gap-1">
            {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
            {useAgent ? 'Agent' : 'Direct'}
          </span>
        </div>

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
