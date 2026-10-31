import type { RefObject } from 'react';
import { BotIcon, BoltIcon } from './Icons';

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
}

/**
 * Compact top bar shown below `md` (frontend decomposition step 9): the
 * hamburger that opens the drawer, the brand, and the active-mode badge.
 *
 * The safe-area top padding keeps the bar clear of an iPhone notch, and the
 * button carries `min-w-[44px] min-h-[44px]` so it stays a valid touch target.
 */
export function MobileTopBar({ sidebarOpen, onOpenSidebar, useAgent, menuButtonRef, isGuest, onLogout }: MobileTopBarProps) {
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
          className="text-chill-deepsea shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <rect x="1" y="4" width="3" height="2" fill="currentColor" />
          <rect x="4" y="2" width="5" height="6" fill="currentColor" />
          <rect x="9" y="3" width="4" height="4" fill="currentColor" opacity="0.85" />
          <rect x="13" y="4" width="2" height="2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
        <span className="inline-flex items-center gap-1 rounded-none border border-chill-border bg-chill-elevated px-2.5 py-1 text-xs text-chill-text">
          <BoltIcon size={14} /> Guest · Direct
        </span>
        <button
          onClick={onLogout}
          aria-label="Keluar"
          className="ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-none text-sm text-chill-muted transition hover:text-chill-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
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
          className="text-chill-deepsea shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <rect x="1" y="4" width="3" height="2" fill="currentColor" />
          <rect x="4" y="2" width="5" height="6" fill="currentColor" />
          <rect x="9" y="3" width="4" height="4" fill="currentColor" opacity="0.85" />
          <rect x="13" y="4" width="2" height="2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      <span className="text-xs text-chill-muted ml-auto inline-flex items-center gap-1">
        {useAgent ? <BotIcon size={14} /> : <BoltIcon size={14} />}
        {useAgent ? 'Agent' : 'Direct'}
      </span>
    </div>
  );
}
