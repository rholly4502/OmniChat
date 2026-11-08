import type { RefObject } from 'react';
import { BotIcon, BoltIcon, ChillIcon } from './Icons';
import { TypingIndicator } from './TypingIndicator';
import { estimateUsd, formatTokens, formatUsd } from '../tokenCost';
import type { ModelOption, TokenUsage } from '../types';

/** Props accepted by {@link MobileTopBar}. */
export interface MobileTopBarProps {
  /** true while the drawer is open (drives `aria-expanded`). Only used in the admin workspace. */
  sidebarOpen?: boolean;
  /** Open the sidebar drawer. Only used in the admin workspace. */
  onOpenSidebar?: () => void;
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Focus target the drawer hook restores when the drawer closes. Only used in the admin workspace. */
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  /** Anonymous guest mode: no sidebar, forced direct, exposes logout. */
  isGuest?: boolean;
  /** Return to the login screen from a guest session. */
  onLogout?: () => void;
  /** Cumulative token usage for the active conversation (server base + live). */
  usage?: TokenUsage;
  /**
   * Estimated completion tokens streamed so far in the in-flight turn. When > 0
   * it is added to the mobile live readout, so the cost estimate ticks as the
   * reply streams instead of appearing only when the turn's usage frame lands.
   */
  streamingEstimate?: number;
  /** Active model id, used for the cost estimate. */
  model?: string;
  /** Human-readable label of the active model, shown beside the mode badge. */
  modelLabel?: string;
  /**
   * Catalog for the active mode, used to render a compact inline per-conversation
   * model switcher (mobile parity with ChatHeader's desktop switcher). When omitted
   * (or when no handler is given) the model is shown as a static label instead.
   */
  models?: ModelOption[];
  /** Per-conversation model change handler (persists for the active thread). */
  onModelChange?: (id: string) => void;
  /** Chill Mode active: show a subtle chillChill" tag by the mode badge. */
  chillMode?: boolean;
  /** Open the aggregate chat stats dialog (mobile path to ChatStatsDialog). */
  onOpenStats?: () => void;
  /** Opens the keyboard-shortcut reference dialog. Optional; hidden when absent. */
  onOpenShortcuts?: () => void;
  /** Active top-level view ('chat' | 'expenses'); hides chat telemetry on expenses. */
  activeView?: 'chat' | 'expenses' | 'jobs' | 'events';
  /**
   * Title of the active conversation. When present (chat view) it is rendered
   * as a truncated label between the brand and the mode badge so the current
   * thread stays identifiable while the drawer is closed. Optional.
   */
  title?: string;
  /**
   * true while an assistant reply is streaming, so the top bar shows a live
   * "thinking" indicator (phase + model + elapsed) even when the transcript is
   * scrolled away from the typing indicator — mobile parity with ChatHeader.
   */
  streaming?: boolean;
  /**
   * Progress phase reported by the backend for the in-flight reply (e.g.
   * "Berpikir…" / "Menyusun jawaban"). Only meaningful while `streaming` is true.
   */
  status?: string;
}

/**
 * Compact top bar shown below `md` (frontend decomposition step 9): the
 * hamburger that opens the drawer, the brand, and the active-mode badge.
 *
 * The safe-area top padding keeps the bar clear of an iPhone notch, and the
 * button carries `min-w-[44px] min-h-[44px]` so it stays a valid touch target.
 */
export function MobileTopBar({ sidebarOpen, onOpenSidebar, useAgent, menuButtonRef, isGuest, onLogout, usage, model, modelLabel, models, onModelChange, activeView, chillMode, onOpenStats, onOpenShortcuts, title, streamingEstimate = 0, streaming = false, status }: MobileTopBarProps) {
  const total = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) + streamingEstimate;
  const estimate = total > 0 && model ? formatUsd(estimateUsd({ promptTokens: usage?.promptTokens ?? 0, completionTokens: (usage?.completionTokens ?? 0) + streamingEstimate }, model)) : '';
  const tokenLabel = total > 0 ? `${formatTokens(total)} token` : '';
  if (isGuest) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-chill-border bg-chill-bg" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}>
        <span className="group relative inline-flex items-center gap-1.5 text-sm font-semibold text-chill-accent pixel-heading">
        OmniChat
        {/* Hidden-until-hover pixel easter egg (header): a tiny deep-sea
            fish that fades in beside the brand — a quiet Dave-the-Diver nod.
            Pure decoration: aria-hidden, non-interactive, opacity-toggled,
            so it never affects layout, usability or the a11y tree. */}
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"
          aria-hidden="true"
          className="text-chill-deepsea shrink-0 opacity-0 pixel-step-fade group-hover:opacity-100 group-focus-within:opacity-100">
          <rect x="1" y="4" width="3" height="2" fill="currentColor" />
          <rect x="4" y="2" width="5" height="6" fill="currentColor" />
          <rect x="9" y="3" width="4" height="4" fill="currentColor" opacity="0.85" />
          <rect x="13" y="4" width="2" height="2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
        <span className="inline-flex items-center gap-1 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text">
          <BoltIcon size={14} /> Guest · Direct
          {(() => {
            const modelInCatalog = !model || Boolean(models?.some((m) => m.id === model));
            return onModelChange && models && models.length > 0 && modelInCatalog ? (
              <span className="relative inline-flex items-center">
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  aria-label="Ganti model"
                  className="appearance-none bg-transparent text-chill-accent text-base md:text-sm font-medium outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 cursor-pointer min-h-[44px] pl-1 pr-4 select-none [color-scheme:dark]"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <svg width="10" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-chill-accent">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            ) : modelLabel ? ` · ${modelLabel}` : ''})()}
        </span>
        {streaming && (
          <span aria-hidden="true" className="inline-flex items-center">
            <TypingIndicator status={status} modelLabel={modelLabel} />
          </span>
        )}
        {chillMode && (
          <span className="inline-flex items-center gap-1 rounded-none px-1 text-xs text-chill-accent font-medium select-none" aria-label="Chill Mode aktif">
            <ChillIcon size={12} />
            Chill
          </span>
        )}
        {(tokenLabel || estimate) && (
          <span className="inline-flex items-center gap-1 rounded-none px-1 text-xs text-chill-muted" aria-label={`Penggunaan token: ${tokenLabel}${estimate ? `, perkiraan biaya ${estimate}` : ''}`}>
            <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span> {tokenLabel}{estimate ? ` · ≈${estimate}` : ''}
          </span>
        )}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Pintasan keyboard"
            title="Pintasan keyboard"
            className="rounded-none inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-chill-muted transition hover:text-chill-accent active:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </button>
        )}
        <button
          onClick={onLogout}
          aria-label="Keluar"
          className="ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-none text-sm text-chill-muted transition hover:text-chill-accent active:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        >
          Keluar
        </button>
      </div>
    );
  }

  return (
    <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-chill-border bg-chill-bg" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}>
      <button
        ref={menuButtonRef}
        onClick={onOpenSidebar}
        aria-expanded={sidebarOpen}
        aria-controls="chat-sidebar"
        className="text-chill-muted hover:text-chill-accent active:bg-chill-elevated p-2 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
        aria-label="Open menu"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="group relative inline-flex items-center gap-1.5 text-sm font-semibold text-chill-accent pixel-heading">
        OmniChat
        {/* Hidden-until-hover pixel easter egg (header): a tiny deep-sea
            fish that fades in beside the brand — a quiet Dave-the-Diver nod.
            Pure decoration: aria-hidden, non-interactive, opacity-toggled,
            so it never affects layout, usability or the a11y tree. */}
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"
          aria-hidden="true"
          className="text-chill-deepsea shrink-0 opacity-0 pixel-step-fade group-hover:opacity-100 group-focus-within:opacity-100">
          <rect x="1" y="4" width="3" height="2" fill="currentColor" />
          <rect x="4" y="2" width="5" height="6" fill="currentColor" />
          <rect x="9" y="3" width="4" height="4" fill="currentColor" opacity="0.85" />
          <rect x="13" y="4" width="2" height="2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      {title && activeView === 'chat' && (
        <span
          className="flex-1 min-w-0 truncate text-xs text-chill-muted select-none px-1"
          title={title}
          aria-label={`Percakapan: ${title}`}
        >
          {title}
        </span>
      )}
      {streaming && activeView === 'chat' && (
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <TypingIndicator status={status} modelLabel={modelLabel} />
        </span>
      )}
      {activeView !== 'expenses' && activeView !== 'jobs' && activeView !== 'events' ? (
        <>
          <span className="text-xs text-chill-muted ml-auto inline-flex items-center gap-1">
            {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
            {useAgent ? 'Agent' : 'Direct'}
            {(() => {
              const modelInCatalog = !model || Boolean(models?.some((m) => m.id === model));
              return onModelChange && models && models.length > 0 && modelInCatalog ? (
              <span className="relative inline-flex items-center">
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  aria-label="Ganti model"
                  className="appearance-none bg-transparent text-chill-accent text-base md:text-sm font-medium outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 cursor-pointer min-h-[44px] pl-1 pr-4 select-none [color-scheme:dark]"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <svg width="10" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-chill-accent">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
              ) : modelLabel ? (
              <span className="text-chill-accent font-medium">{modelLabel}</span>
            ) : null})()}
          </span>
          {chillMode && (
            <span className="inline-flex items-center gap-1 rounded-none border border-chill-border bg-chill-surface px-1.5 py-0.5 text-xs text-chill-accent font-medium select-none" aria-label="Chill Mode aktif">
              <ChillIcon size={12} />
              Chill
            </span>
          )}
          {(tokenLabel || estimate) && (onOpenStats ? (
            <button
              type="button"
              onClick={onOpenStats}
              aria-haspopup="dialog"
              aria-label={`Penggunaan token: ${tokenLabel}${estimate ? `, perkiraan biaya ${estimate}` : ''}`}
              title="Statistik chat"
              className="rounded-none inline-flex items-center gap-1 px-2 min-h-[44px] min-w-[44px] text-xs text-chill-muted transition hover:text-chill-accent active:bg-chill-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span> {tokenLabel}{estimate ? ` · ≈${estimate}` : ''}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-none px-1 text-xs text-chill-muted" aria-label={`Penggunaan token: ${tokenLabel}${estimate ? `, perkiraan biaya ${estimate}` : ''}`}>
              <span aria-hidden="true" className="inline-flex"><BoltIcon size={12} /></span> {tokenLabel}{estimate ? ` · ≈${estimate}` : ''}
            </span>
          ))}
        </>
      ) : activeView === 'expenses' ? (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-accent pixel-heading">
          Pengeluaran
        </span>
      ) : activeView === 'jobs' ? (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-accent pixel-heading">
          Lowongan
        </span>
      ) : (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-accent pixel-heading">
          Event
        </span>
      )}
      {onOpenShortcuts && (
        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Pintasan keyboard"
          title="Pintasan keyboard"
          className="rounded-none inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </button>
      )}
    </div>
  );
}
