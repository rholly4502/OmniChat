import type { RefObject } from 'react';
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
              <TypingIndicator />
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
  );
}
