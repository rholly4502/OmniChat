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
  /**
   * Re-run the last turn. Passed from the chat hook; rendered as a "Coba lagi"
   * button on the trailing assistant message when the stream is idle.
   */
  onRegenerate?: () => void;
  /**
   * Replace a user message and resend. Opens an inline editor on that bubble;
   * Save calls this with the new text.
   */
  onEditMessage?: (index: number, newContent: string) => void;
}

/** Small, quiet action button used on message footers. */
function ActionButton({ label, activeLabel, active, onClick, icon, activeIcon }: {
  label: string;
  activeLabel?: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1 px-2 min-h-[44px] min-w-[44px] md:min-h-[28px] rounded-none text-chill-muted hover:text-chill-accent hover:bg-chill-elevated active:bg-chill-surface active:translate-y-[2px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-chill-accent/60"
      aria-label={active ? activeLabel : label}
      aria-pressed={active}
    >
      {active ? (activeIcon ?? icon) : icon}
      {active && activeLabel ? <span className="text-chill-accent font-medium">{activeLabel}</span> : null}
    </button>
  );
}

/**
 * Scrollable transcript: empty state, message bubbles, markdown rendering and
 * the typing indicator (frontend decomposition step 8), plus the regenerate and
 * edit-resend actions.
 *
 * Markup and classes are unchanged from the inline JSX it replaces, so the
 * `aria-live` / `aria-busy` contract the app tests assert on is preserved.
 */
export function MessageList({ messages, streaming, models, model, useAgent, scrollRef, onRegenerate, onEditMessage }: MessageListProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {});
  };

  const startEdit = (index: number) => {
    setDraft(messages[index].content);
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft('');
  };

  const saveEdit = (index: number) => {
    if (!draft.trim()) return;
    onEditMessage?.(index, draft);
    setEditingIndex(null);
    setDraft('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(index);
    }
  };

  const isLastMessage = (i: number) => i === messages.length - 1;

  return (
    <div ref={scrollRef} aria-busy={streaming} aria-live="polite" aria-label="Chat messages"
      className="flex-1 overflow-y-auto overscroll-y-contain p-3 md:p-6 space-y-3 md:space-y-4">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
          {/* Decorative pixel-art terminal ornament (chill palette, hard-edged).
              Pure decoration — aria-hidden so it stays out of the a11y tree. */}
          <svg
            width="44"
            height="28"
            viewBox="0 0 44 28"
            fill="none"
            aria-hidden="true"
            className="text-chill-muted shrink-0"
          >
            <rect x="2" y="4" width="40" height="20" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="9" width="3" height="3" fill="currentColor" />
            <rect x="14" y="9" width="3" height="3" fill="currentColor" opacity="0.6" />
            <rect x="20" y="9" width="3" height="3" fill="currentColor" opacity="0.35" />
            <rect x="8" y="17" width="12" height="3" fill="currentColor" opacity="0.7" />
            <rect x="22" y="16" width="4" height="4" fill="currentColor" className="text-chill-accent" />
          </svg>
          {/* Subtle easter egg — nods to Stardew Valley & Dave the Diver:
              a pixel sprout (sage) and a pixel fish (deep sea). Hover reveals a
              quiet caption. Pure decoration — aria-hidden, rect-only, never
              interactive, so it cannot affect usability or the a11y tree. */}
          <div className="group relative flex flex-col items-center" aria-hidden="true">
            <div className="flex items-center gap-3 text-chill-sage">
              <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden="true" className="shrink-0">
                <rect x="14" y="7" width="2" height="9" fill="currentColor" />
                <rect x="8" y="5" width="6" height="2" fill="currentColor" />
                <rect x="16" y="5" width="6" height="2" fill="currentColor" />
                <rect x="6" y="3" width="4" height="2" fill="currentColor" opacity="0.55" />
                <rect x="20" y="3" width="4" height="2" fill="currentColor" opacity="0.55" />
                <rect x="3" y="16" width="24" height="2" fill="currentColor" opacity="0.3" />
                <rect x="5" y="18" width="20" height="2" fill="currentColor" opacity="0.18" />
              </svg>
              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true" className="text-chill-deepsea shrink-0">
                <rect x="1" y="5" width="4" height="2" fill="currentColor" />
                <rect x="1" y="8" width="4" height="2" fill="currentColor" opacity="0.65" />
                <rect x="5" y="3" width="7" height="6" fill="currentColor" />
                <rect x="12" y="3" width="5" height="6" fill="currentColor" opacity="0.85" />
                <rect x="17" y="4" width="5" height="4" fill="currentColor" />
                <rect x="5" y="6" width="7" height="3" fill="currentColor" opacity="0.45" />
              </svg>
            </div>
            <span className="mt-1.5 text-xs text-chill-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 select-none">
              A calm pixel farm vibe
            </span>
          </div>
          <div className="text-chill-muted text-sm text-center">
            Mulai chat — mode {useAgent ? 'Agent (Hermes)' : 'Direct (LLM)'} ·{' '}
            {models.find((m) => m.id === model)?.label}
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {m.role === 'user' && editingIndex === i ? (
            /* Inline edit mode for a user turn. */
            <div className="flex flex-col items-end gap-2 w-full">
              <div className="w-full max-w-[85%] md:max-w-[75%] bg-chill-surface border-2 border-chill-accent rounded-none p-2">
                <textarea
                  autoFocus
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, i)}
                  aria-label="Edit pesan"
                  placeholder="Edit pesan…"
                  className="w-full bg-transparent text-base md:text-sm leading-relaxed outline-none resize-none text-chill-text placeholder:text-chill-muted"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="bg-chill-surface border-2 border-chill-border text-chill-text hover:bg-chill-elevated rounded-none px-3 py-1.5 text-sm transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(i)}
                  disabled={!draft.trim()}
                  className="bg-chill-accent text-chill-on-accent hover:bg-chill-accent-hover active:bg-chill-accent-active disabled:opacity-40 rounded-none px-3 py-1.5 text-sm font-semibold transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/70"
                >
                  Simpan & kirim
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`
                max-w-[85%] md:max-w-[75%] rounded-none px-3.5 md:px-4 py-2.5 md:py-3
                text-sm leading-relaxed break-words
                ${m.role === 'user'
                  ? 'bg-chill-accent text-chill-on-accent border-2 border-chill-border'
                  : 'bg-chill-surface border-2 border-chill-border rounded-none'
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
                  <div className="mt-2 pt-1.5 border-t border-chill-border flex items-center justify-between text-xs text-chill-muted select-none">
                    <span>OmniChat</span>
                    <div className="flex items-center">
                      {isLastMessage(i) && !streaming && onRegenerate && (
                        <ActionButton
                          label="Coba lagi"
                          onClick={onRegenerate}
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /></svg>
                          }
                        />
                      )}
                      <ActionButton
                        label="Salin pesan"
                        activeLabel="Pesan tersalin"
                        active={copiedIndex === i}
                        onClick={() => handleCopy(m.content, i)}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><rect x="9" y="9" width="13" height="13" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        }
                        activeIcon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" className="text-chill-accent" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {onEditMessage && (
                    <div className="mt-2 pt-1.5 border-t border-chill-border flex items-center justify-end text-xs text-chill-muted select-none">
                      <ActionButton
                        label="Edit pesan"
                        onClick={() => startEdit(i)}
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
