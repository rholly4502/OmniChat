import type { RefObject } from 'react';
import { BotIcon, BoltIcon } from './Icons';

/** Props accepted by {@link MobileTopBar}. */
export interface MobileTopBarProps {
  /** true while the drawer is open (drives `aria-expanded`). */
  sidebarOpen: boolean;
  /** Open the sidebar drawer. */
  onOpenSidebar: () => void;
  /** Agent (Hermes bridge) vs Direct (LLM) mode. */
  useAgent: boolean;
  /** Focus target the drawer hook restores when the drawer closes. */
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  /** Hide the drawer toggle (guest mode has no sidebar). */
  isGuest?: boolean;
}

/**
 * Compact top bar shown below `md` (frontend decomposition step 9): the
 * hamburger that opens the drawer, the brand, and the active-mode badge.
 *
 * The safe-area top padding keeps the bar clear of an iPhone notch, and the
 * button carries `min-w-[44px] min-h-[44px]` so it stays a valid touch target.
 */
export function MobileTopBar({ sidebarOpen, onOpenSidebar, useAgent, menuButtonRef, isGuest }: MobileTopBarProps) {
  return (
    <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-slate-800 bg-slate-950" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}>
      {!isGuest && (
        <button
          ref={menuButtonRef}
          onClick={onOpenSidebar}
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
      )}
      <span className="text-sm font-semibold text-cyan-400">OmniChat</span>
      <span className="text-xs text-slate-400 ml-auto inline-flex items-center gap-1">
        {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
        {useAgent ? 'Agent' : 'Direct'}
      </span>
    </div>
  );
}
