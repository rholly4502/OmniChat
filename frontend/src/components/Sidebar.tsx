import type { RefObject } from 'react';
import { BotIcon, BoltIcon, LockIcon, UnlockIcon } from './Icons';
import type { ModelOption } from '../types';

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
  /** Drop the conversation. */
  onClear: () => void;
}

/**
 * Settings drawer: branding, mode toggle, model selector, API key and Clear
 * chat (frontend decomposition step 8).
 *
 * `role="dialog"` / `aria-modal` are only set while the drawer is open, which
 * is what the focus-trap in `useSidebarDrawer` keys off. Markup and classes are
 * unchanged from the inline JSX it replaces, including the `id="chat-sidebar"`
 * that the hamburger's `aria-controls` points at.
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
  onClear,
}: SidebarProps) {
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
        w-[85vw] max-w-[18rem] border-r border-slate-800 px-4 flex flex-col gap-4 overflow-y-auto overscroll-y-contain
        bg-slate-950
        transform transition-transform duration-300 ease-in-out will-change-transform
        ${open ? 'translate-x-0' : '-translate-x-full'}
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
          onClick={onClose}
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
            onChange={onToggleMode}
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
          onChange={(e) => onModelChange(e.target.value)}
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
          onChange={(e) => onApiKeyChange(e.target.value)}
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
        onClick={onClear}
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
  );
}
