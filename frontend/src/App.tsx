import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Role = 'user' | 'assistant';

interface Message {
  role: Role;
  content: string;
}

interface ModelOption {
  id: string;
  label: string;
}

const API_URL = '/api/chat/stream';
const API_KEY_STORAGE = 'omnichat_api_key';

const DEFAULT_AGENT_MODELS: ModelOption[] = [
  { id: 'hermes', label: 'Hermes (Default)' },
  { id: 'claude-sonnet', label: 'Claude Sonnet' },
  { id: 'gpt-4o', label: 'GPT-4o' },
];

const DEFAULT_DIRECT_MODELS: ModelOption[] = [
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 (Free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)' },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [useAgent, setUseAgent] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState('hermes');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ agent: ModelOption[]; direct: ModelOption[] }>({
    agent: DEFAULT_AGENT_MODELS,
    direct: DEFAULT_DIRECT_MODELS,
  });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const models = useAgent ? catalog.agent : catalog.direct;

  useEffect(() => {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey);
    else localStorage.removeItem(API_KEY_STORAGE);
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models', {
      headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { agent?: ModelOption[]; direct?: ModelOption[] }) => {
        if (cancelled) return;
        setCatalog({
          agent: data.agent?.length ? data.agent : DEFAULT_AGENT_MODELS,
          direct: data.direct?.length ? data.direct : DEFAULT_DIRECT_MODELS,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  function toggleMode() {
    const next = !useAgent;
    setUseAgent(next);
    setModel(next ? catalog.agent[0].id : catalog.direct[0].id);
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: 'user', content: input };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-Api-Key'] = apiKey;

      const res = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          useHermesBridge: useAgent,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const retryAfter = res.headers.get('Retry-After');
        const detail = res.status === 401 ? 'Autentikasi diperlukan (401). Masukkan API key di sidebar.'
          : res.status === 429
            ? retryAfter
              ? `Terlalu banyak permintaan (429). Coba lagi dalam ${retryAfter} detik.`
              : 'Terlalu banyak permintaan (429). Coba lagi nanti.'
          : res.status === 400 ? 'Permintaan tidak valid (400). Periksa input.'
          : `Backend menolak permintaan (${res.status}).`;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `⚠️ ${detail}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue;
          const data = evt.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: last.content
                    ? `${last.content}\n\n⚠️ ${parsed.error}`
                    : `⚠️ ${parsed.error}`,
                };
                return copy;
              });
            } else if (parsed.content) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: copy[copy.length - 1].content + parsed.content,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: '⚠️ Koneksi ke backend gagal. Pastikan API .NET berjalan.' },
        ]);
      } else {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1)];
          }
          return prev;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-dvh bg-slate-950 text-slate-100 overflow-hidden">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen ? "true" : undefined}
        aria-label="Chat settings"
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-72 border-r border-slate-800 p-4 flex flex-col gap-4
          bg-slate-950
          transform transition-transform duration-300 ease-in-out
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
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-200 p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-slate-900 rounded-lg p-3 border border-slate-800 hover:border-cyan-600 transition">
            <input
              type="checkbox"
              checked={useAgent}
              onChange={toggleMode}
              className="h-4 w-4 accent-cyan-500"
            />
            <div>
              <div className="text-sm font-semibold">
                {useAgent ? '🤖 Agent Mode' : '⚡ Direct Mode'}
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
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 min-h-[44px]"
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
            <span className="text-xs">{apiKey ? '🔒' : '🔓'}</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="(kosong = tanpa auth)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 text-sm outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/60 min-h-[44px]"
            id="api-key-input"
          />
          <p className="text-xs text-slate-400">
            {apiKey ? 'Authenticated — header X-Api-Key aktif.' : 'Tanpa auth — backend tanpa API key.'}
          </p>
        </div>

        <button
          onClick={() => setMessages([])}
          className="mt-auto text-xs text-slate-400 hover:text-red-400 transition text-left py-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded-lg"
        >
          ✕ Clear chat
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-slate-800 bg-slate-950" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-cyan-400 p-2 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            aria-label="Open menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-cyan-400">OmniChat</span>
          <span className="text-xs text-slate-400 ml-auto">
            {useAgent ? '🤖 Agent' : '⚡ Direct'}
          </span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} aria-live="polite"
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
                  <span className="inline-flex gap-1 items-center py-1">
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse" />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:200ms]" />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:400ms]" />
                  </span>
                ) : m.role === 'assistant' ? (
                  <div className="md-body">
                    <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{ table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div> }}
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
                className="bg-red-600 hover:bg-red-500 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl px-4 md:px-6 text-sm font-semibold transition min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
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
