import { useRef, useState } from 'react';

type Role = 'user' | 'assistant';
interface Message { role: Role; content: string; }

const API_URL = '/api/chat/stream';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [useAgent, setUseAgent] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: useAgent ? 'hermes' : 'nvidia/nemotron-3.5-lightning:free',
          useHermesBridge: useAgent,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });

      const reader = res.body!.getReader();
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
            if (parsed.content) {
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: copy[copy.length - 1].content + parsed.content,
                };
                return copy;
              });
            }
          } catch { /* skip partial chunk */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: '⚠️ Koneksi ke backend gagal. Pastikan API .NET berjalan.' }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-800 p-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-cyan-400">OmniChat</h1>
        <p className="text-xs text-slate-500">Hybrid AI Dashboard · .NET 10</p>

        {/* Mode Toggle */}
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer bg-slate-900 rounded-lg p-3 border border-slate-800 hover:border-cyan-600 transition">
            <input
              type="checkbox"
              checked={useAgent}
              onChange={e => setUseAgent(e.target.checked)}
              className="h-4 w-4 accent-cyan-500"
            />
            <div>
              <div className="text-sm font-semibold">{useAgent ? '🤖 Agent Mode' : '⚡ Direct Mode'}</div>
              <div className="text-xs text-slate-500">
                {useAgent ? 'Hermes Gateway (tools + memory)' : 'Langsung ke LLM (cepat)'}
              </div>
            </div>
          </label>
        </div>

        <button
          onClick={() => setMessages([])}
          className="mt-auto text-xs text-slate-500 hover:text-red-400 transition text-left"
        >
          ✕ Clear chat
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-600 text-sm">
              Mulai chat — mode {useAgent ? 'Agent (Hermes)' : 'Direct (LLM)'}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-sm'
                  : 'bg-slate-900 border border-slate-800 rounded-bl-sm'
              }`}>
                {m.content || <span className="text-slate-500 italic">thinking…</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={streaming ? 'Menunggu respons…' : 'Ketik pesan…'}
              disabled={streaming}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl px-6 text-sm font-semibold transition"
            >
              Kirim
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
