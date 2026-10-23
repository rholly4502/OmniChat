import { useState, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { TypingIndicator } from './TypingIndicator';
import type { Message, ModelOption } from '../types';

/** Props accepted by {@link MessageList}. */
export interface MessageListProps {
  /** Conversation so far; the last entry streams in place. */
  messages: Message[];
  /** true while an assistant reply is arriving (drives `aria-busy`). */
  streaming: boolean;
  /** Catalog for the active mode, used only to label the empty state. */
  models: ModelOption[];
  /** Currently selected model id. */
  model: string;
  /** Which mode the empty state should name. */
  useAgent: boolean;
  /** Scroll container, owned by App.tsx (it drives auto-scroll). */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * Scrollable transcript: empty state, message bubbles, markdown rendering and
 * the typing indicator (frontend decomposition step 8).
 *
 * Markup and classes are unchanged from the inline JSX it replaces, so the
 * `aria-live` / `aria-busy` contract the app tests assert on is preserved.
 */
export function MessageList({ messages, streaming, models, model, useAgent, scrollRef }: MessageListProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {});
  };
  return (
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
              <TypingIndicator status={m.status} />
            ) : m.role === 'assistant' ? (
              <div>
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
                <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 select-none">
                  <span className="text-[11px] text-slate-500">OmniChat</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(m.content, i)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
                    aria-label={copiedIndex === i ? 'Pesan tersalin' : 'Salin pesan'}
                  >
                    {copiedIndex === i ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                        <span className="text-[11px] text-cyan-400 font-medium">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        <span className="text-[11px]">Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
