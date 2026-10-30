import { useState, type RefObject } from 'react';
import { BotIcon, BoltIcon, LockIcon, UnlockIcon } from './Icons';
import type { ChatSession, ChatSettings, ModelOption } from '../types';

/** Props accepted by {@link Sidebar}. */
export interface SidebarProps {
  /** The `<aside>` element; the drawer hook transforms and measures it. */
  sidebarRef: RefObject<HTMLElement | null>;
  /** true while the mobile drawer is on screen. */
  open: boolean;
  /** Close the drawer (close button and backdrop). */
  onClose: () => void;
  /** Receives focus when the drawer opens. */
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Flip the mode and reset the model to that mode's first entry. */
  onToggleMode: () => void;
  /** Catalog for the active mode. */
  models: ModelOption[];
  /** Selected model id. */
  model: string;
  /** Model selection handler. */
  onModelChange: (id: string) => void;
  /** Backend API key, persisted to localStorage by App.tsx. */
  apiKey: string;
  /** API key change handler. */
  onApiKeyChange: (value: string) => void;
  /** Clears the stored credential and returns to the login screen. */
  onLogout: () => void;
  /** Drop the conversation. */
  onClear: () => void;
  /** List of chat sessions for history. */
  sessions?: ChatSession[];
  /** Currently active session ID. */
  activeSessionId?: string;
  /** Create a new session. */
  onNewSession?: () => void;
  /** Select a session. */
  onSelectSession?: (id: string) => void;
  /** Delete a session. */
  onDeleteSession?: (id: string) => void;
  /** Export a session. */
  onExportSession?: (session: ChatSession) => void;
  /** Optional LLM sampling settings and system prompt. */
  settings?: ChatSettings;
  /** System prompt change handler. */
  onSystemPromptChange?: (prompt: string) => void;
  /** Temperature change handler. */
  onTemperatureChange?: (temp: number) => void;
  /** Max tokens change handler. */
  onMaxTokensChange?: (tokens: number) => void;
  /** Active top-level view ('chat' or 'expenses'). */
  activeView?: 'chat' | 'expenses';
  /** Switch the active top-level view. */
  onSelectView?: (view: 'chat' | 'expenses') => void;
}

/**
 * Settings drawer: branding, session history, mode toggle, model selector, API key,
 * parameter controls, and Clear chat.
 */
export function Sidebar({
  sidebarRef,
  open,
  onClose,
  closeButtonRef,
  useAgent,
  onToggleMode,
  models,
  model,
  onModelChange,
  apiKey,
  onApiKeyChange,
  onLogout,
  onClear,
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onExportSession,
  settings,
  onSystemPromptChange,
  onTemperatureChange,
  onMaxTokensChange,
  activeView = 'chat',
  onSelectView = () => {},
}: SidebarProps) {
  // Two-step delete: tapping the bin only arms the row; the session is removed
  // when the user confirms. A 44px bin sits next to the session label, so a
  // single mistap used to destroy a whole conversation with no undo.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <aside
      ref={sidebarRef}
      id="chat-sidebar"
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label="Chat settings"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      className={`
        fixed md:static inset-y-0 left-0 z-50
        w-[85vw] max-w-[18rem] border-r border-chill-border px-4 flex flex-col gap-4 overflow-y-auto overscroll-y-contain
        bg-chill-bg
        transform transition-transform duration-300 ease-in-out will-change-transform
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-chill-accent pixel-heading">OmniChat</h1>
          <p className="text-xs text-chill-muted">Hybrid AI Dashboard · .NET 10</p>
        </div>
        {/* Close button (mobile only) */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="md:hidden text-chill-muted hover:text-chill-accent active:bg-chill-elevated p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Top-level view switcher: Chat vs Pengeluaran */}
      <div className="grid grid-cols-2 gap-1 rounded-none bg-chill-surface border border-chill-border p-1" role="tablist" aria-label="Pilih tampilan">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'chat'}
          onClick={() => onSelectView('chat')}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
            activeView === 'chat'
              ? 'bg-chill-elevated text-chill-text shadow-sm'
              : 'text-chill-muted hover:text-chill-accent'
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'expenses'}
          onClick={() => onSelectView('expenses')}
          className={`rounded-none px-3 py-2 text-sm font-medium transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 ${
            activeView === 'expenses'
              ? 'bg-chill-elevated text-chill-text shadow-sm'
              : 'text-chill-muted hover:text-chill-accent'
          }`}
        >
          Pengeluaran
        </button>
      </div>

      {/* New Chat Button */}
      {onNewSession && (
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 bg-chill-accent hover:bg-chill-accent/90 text-chill-on-accent font-medium py-2 px-3 rounded-none text-sm transition pixel-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Chat Baru
        </button>
      )}

      {/* Sessions History List */}
      {sessions && sessions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-chill-muted font-medium px-1 flex items-center justify-between">
            <span>Riwayat Sesi</span>
            <span className="text-xs text-chill-muted">{sessions.length} sesi</span>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1 overscroll-y-contain">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && pendingDeleteId === s.id) {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                    }
                  }}
                  className={`group flex items-center justify-between gap-0.5 pl-1 pr-0.5 rounded-none text-sm transition min-h-[44px] ${
                    isActive
                      ? 'bg-chill-elevated text-chill-accent font-medium border border-chill-accent/40'
                      : 'text-chill-text hover:bg-chill-surface hover:text-chill-accent border border-transparent'
                  }`}
                >
                  {pendingDeleteId === s.id ? (
                    <div className="flex flex-1 min-w-0 items-center justify-between gap-1 pl-2">
                      <span className="truncate text-sm text-chill-text">Hapus sesi ini?</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          autoFocus
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(null);
                          }}
                          aria-label={`Batal hapus ${s.title}`}
                          className="min-h-[44px] min-w-[52px] border border-chill-border px-2 text-sm text-chill-text transition hover:bg-chill-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(null);
                            onDeleteSession?.(s.id);
                          }}
                          aria-label={`Konfirmasi hapus ${s.title}`}
                          className="min-h-[44px] min-w-[52px] bg-chill-red/20 px-2 text-sm font-medium text-chill-red transition hover:bg-chill-red/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ) : (
                  <>
                  <button
                    type="button"
                    onClick={() => onSelectSession?.(s.id)}
                    aria-current={isActive ? 'true' : undefined}
                    title={s.title}
                    className="flex items-center text-left flex-1 min-w-0 min-h-[44px] cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                  >
                    <span className="truncate flex-1 pr-1.5">{s.title}</span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-100 md:opacity-70 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    {onExportSession && s.messages.length > 0 && (
                      <button
                        type="button"
                        title="Ekspor Markdown"
                        aria-label={`Ekspor ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportSession(s);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-accent rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </button>
                    )}
                    {onDeleteSession && (
                      <button
                        type="button"
                        title="Hapus sesi"
                        aria-label={`Hapus ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteId(s.id);
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-chill-red rounded-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                  </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-3 cursor-pointer bg-chill-surface p-3 border border-chill-border hover:border-chill-accent active:border-chill-accent transition pixel-shadow-sm">
          <input
            type="checkbox"
            checked={useAgent}
            onChange={onToggleMode}
            className="h-4 w-4 accent-chill-accent"
          />
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              {useAgent ? <BotIcon /> : <BoltIcon />}
              {useAgent ? 'Agent Mode' : 'Direct Mode'}
            </div>
            <div className="text-xs text-chill-muted">
              {useAgent ? 'Hermes Gateway (tools + memory)' : 'Langsung ke LLM (cepat)'}
            </div>
          </div>
        </label>
      </div>

      {/* Model Selector */}
      <div className="space-y-1">
        <label htmlFor="model-select" className="text-xs text-chill-muted font-medium">Model</label>
        <div className="relative">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full appearance-none bg-chill-surface border border-chill-border px-3 py-3 pr-9 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px] cursor-pointer hover:border-chill-accent/60 transition-colors pixel-shadow-sm"
            id="model-select"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chill-muted"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1">
        <label htmlFor="api-key-input" className="text-xs text-chill-muted font-medium flex items-center gap-1">
          API Key
          <span data-testid={apiKey ? 'lock-icon' : 'unlock-icon'} className="inline-flex text-chill-muted">
            {apiKey ? <LockIcon /> : <UnlockIcon />}
          </span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="(kosong = tanpa auth)"
          className="w-full bg-chill-surface border border-chill-border px-3 py-3 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-2 focus-visible:ring-chill-accent/60 min-h-[44px]"
          id="api-key-input"
        />
        <p className="text-xs text-chill-muted">
          {apiKey ? 'Authenticated — header X-Api-Key aktif.' : 'Tanpa auth — backend tanpa API key.'}
        </p>
        {apiKey && (
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 w-full border border-chill-border px-3 py-2 text-sm text-chill-text transition hover:border-chill-accent hover:text-chill-accent min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            Keluar
          </button>
        )}
      </div>

      {/* Advanced Parameters & } ; System Prompt */}
      {settings && (
        <details className="space-y-2 bg-chill-surface/70 border border-chill-border rounded-none p-2.5">
          <summary className="text-sm font-semibold text-chill-text cursor-pointer flex items-center justify-between select-none min-h-[44px] gap-1 px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              Parameter & Persona
            </span>
            <span className="text-xs text-chill-accent font-mono">T: {settings.temperature}</span>
          </summary>
          <div className="pt-2 space-y-2.5">
            <div>
              <label htmlFor="system-prompt-input" className="block text-xs text-chill-muted font-medium mb-1">
                System Prompt (Instruksi Peran)
              </label>
              <textarea
                id="system-prompt-input"
                rows={2}
                value={settings.systemPrompt}
                onChange={(e) => onSystemPromptChange?.(e.target.value)}
                placeholder="Contoh: Bertindak sebagai Software Architect..."
                className="w-full bg-chill-surface border border-chill-border p-2 text-base md:text-sm outline-none focus:border-chill-accent focus-visible:ring-1 focus-visible:ring-chill-accent/60 resize-none"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-chill-muted mb-1">
                <span>Temperature</span>
                <span className="font-mono text-chill-accent">{settings.temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.1"
                aria-label="Temperature"
                value={settings.temperature}
                onChange={(e) => onTemperatureChange?.(parseFloat(e.target.value))}
                className="w-full accent-chill-accent cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-chill-muted mb-1">
                <span>Max Tokens</span>
                <span className="font-mono text-chill-accent">{settings.maxTokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                aria-label="Max Tokens"
                value={settings.maxTokens}
                onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value, 10))}
                className="w-full accent-chill-accent cursor-pointer"
              />
            </div>
          </div>
        </details>
      )}

      <button
        onClick={onClear}
        className="mt-auto text-sm text-chill-muted hover:text-chill-red active:text-chill-red transition text-left py-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-red/60"
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
  );
}
