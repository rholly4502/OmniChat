import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiError } from './api';
import { BotIcon, BoltIcon, LockIcon, UnlockIcon } from './components/Icons';
import { CodeBlock } from './components/CodeBlock';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useChat } from './hooks/useChat';
import { useSidebarDrawer } from './hooks/useSidebarDrawer';

// Re-exported for backwards compatibility (tests import it from './App').
export { CodeBlock };
import { API_KEY_STORAGE, DEFAULT_MODEL } from './constants';

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

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="chat-sidebar"
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen ? "true" : undefined}
        aria-label="Chat settings"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-[85vw] max-w-[18rem] border-r border-slate-800 px-4 flex flex-col gap-4 overflow-y-auto overscroll-y-contain
          bg-slate-950
          transform transition-transform duration-300 ease-in-out will-change-transform
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-cyan-400">OmniChat</h1>
            <p className="text-xs text-slate-400">Hybrid AI Dashboard · .NET 10</p>
          </div>
          {/* Close button (mobile only) */}
          <button
            ref={closeButtonRef}
            onClick={closeDrawer}
            className="md:hidden text-slate-400 hover:text-slate-200 active:bg-slate-800/50 p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-slate-900 rounded-lg p-3 border border-slate-800 hover:border-cyan-600 active:border-cyan-500 transition">
            <input
              type="checkbox"
              checked={useAgent}
              onChange={toggleMode}
              className="h-4 w-4 accent-cyan-500"
            />
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                {useAgent ? <BotIcon /> : <BoltIcon />}
                {useAgent ? 'Agent Mode' : 'Direct Mode'}
              </div>
              <div className="text-xs text-slate-400">
                {useAgent ? 'Hermes Gateway (tools + memory)' : 'Langsung ke LLM (cepat)'}
              </div>
            </div>
          </label>
        </div>

        {/* Model Selector */}
        <div className="space-y-1">
          <label htmlFor="model-select" className="text-xs text-slate-400 font-medium">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 text-base md:text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 min-h-[44px]"
            id="model-select"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="space-y-1">
          <label htmlFor="api-key-input" className="text-xs text-slate-400 font-medium flex items-center gap-1">
            API Key
            <span data-testid={apiKey ? 'lock-icon' : 'unlock-icon'} className="inline-flex text-slate-400">
              {apiKey ? <LockIcon /> : <UnlockIcon />}
            </span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="(kosong = tanpa auth)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 text-base md:text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 min-h-[44px]"
            id="api-key-input"
          />
          <p className="text-xs text-slate-400">
            {apiKey ? 'Authenticated — header X-Api-Key aktif.' : 'Tanpa auth — backend tanpa API key.'}
          </p>
        </div>

        <button
          onClick={clearMessages}
          className="mt-auto text-sm text-slate-400 hover:text-red-400 active:text-red-300 transition text-left py-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded-lg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mr-1.5 -mt-0.5" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Clear chat
        </button>
      </aside>

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

        {/* Messages */}
        <div ref={scrollRef} aria-busy={streaming} aria-live="polite" aria-label="Chat messages"
          className="flex-1 overflow-y-auto overscroll-y-contain p-3 md:p-6 space-y-3 md:space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
              Mulai chat — mode {useAgent ? 'Agent (Hermes)' : 'Direct (LLM)'} ·{' '}
              {models.find((m) => m.id === model)?.label}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[85%] md:max-w-[75%] rounded-2xl px-3.5 md:px-4 py-2.5 md:py-3
                  text-sm leading-relaxed break-words
                  ${m.role === 'user'
                    ? 'bg-cyan-600 text-white rounded-br-sm'
                    : 'bg-slate-900 border border-slate-800 rounded-bl-sm'
                  }
                `}
              >
                {m.role === 'assistant' && !m.content ? (
                  <span className="inline-flex gap-1 items-center py-1" role="status" aria-label="Menunggu respons">
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse" aria-hidden="true" />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:200ms]" aria-hidden="true" />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:400ms]" aria-hidden="true" />
                  </span>
                ) : m.role === 'assistant' ? (
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
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 md:p-4 border-t border-slate-800" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
          <div className="flex gap-2">
            <input
              aria-label="Ketik pesan"
              value={input}
              enterKeyHint="send"
              autoComplete="off"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={streaming ? 'Menunggu respons…' : 'Ketik pesan…'}
              disabled={streaming}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 md:px-4 py-3 text-base md:text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-50 min-h-[44px]"
            />
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-40 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] shrink-0 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                Kirim
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
